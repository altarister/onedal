import { APP_FILTER_KEYS, callFilterBlocker, effectiveRadii, reservedPickupRadiusKmOf } from "@onedal/shared";
import type { AppFilter } from "@onedal/shared";
import { capacityFullHold } from "../core/helpers";
import { readWaitTimes } from "../core/waitTimes";
import { buildAppOrderKm } from "./filterManager";
import type { UserSession } from "./userSessionStore";

/** 🔒 콜 잡기를 멈춘 까닭 넷 — 값은 이미 `isActive=false` 로 들었다 · 로그는 부른 쪽(폰 문)이 찍는다 */
export interface AppFilterHolds {
    bootstrapping: boolean;
    capacityFull: boolean;
    notRestored: boolean;
    blocker: string | null;
}

/**
 * 📦 **앱에 내려갈 필터 — 한 곳에서 만든다** (onedal-69 «가»).
 *    폰 문(`routes/scrap.ts`)이 싣는 값이고, 운영센터 현황판 · 관제웹이 «폰이 받는 값»으로 같은 것을 읽는다.
 *    화면이 `activeFilter` 만 읽으면 아래에서 얹는 칸(자동 반경 · 복귀 목적지 · 내일 콜 · 경로 순서 · 잠금)이 빠져 폰과 다르다.
 *
 * 🔴 **로그를 찍지 않고 세션을 바꾸지 않는다** — 읽는 문이 불러도 폰 쪽 기록이 안 흔들린다.
 *    내일 콜 목록(`reserved`)은 부른 쪽이 넘긴다: 폰 문은 `ensureReservedPickupList` 로 잰 것, 읽는 문은 폰에 마지막으로 실은 `session.reservedPickup`.
 * 🔴 칸 순서 · 셈은 폰 문에 있던 그대로다 — `appFilterOf.test.ts` 가 옛 조립과 깊이 같은지 문다.
 */
export function appFilterOf(
    session: UserSession,
    userId: string,
    deviceId: string | null | undefined,
    reserved: { keywords: string[]; groups: Record<string, string[]> } | null,
): { filter: AppFilter; holds: AppFilterHolds } {
    /**
     * 📦 **앱이 읽는 키만 골라 싣는다**.
     *    표는 `shared` 의 `APP_FILTER_KEYS` 하나다.
     *
     * 🔴 «떼는 키»를 손으로 나열하면 새 칸이 생길 때마다 그 목록에 넣어야 하고, **안 넣으면 조용히 앱으로 간다.**
     *    골라 싣는 쪽은 **기본이 «안 간다»** 라 안전하다.
     *
     * 여기서 안 실리는 값(`destinationGroups`·마름모·제외 지역·국면 축 …)은
     * **관제웹이 소켓(`filter-updated`)으로 따로 받는다.** 하트비트에 실으면 낭비다 —
     * 예: `destinationGroups` 하나가 응답의 27%(약 3.6KB)다.
     */
    const src = session.activeFilter as unknown as Record<string, unknown>;
    const filter: AppFilter = {};
    for (const k of APP_FILTER_KEYS) if (src[k] !== undefined) filter[k] = src[k];
    /**
     * 📐 **앱에는 «지금 실제로 쓰이는» 반경이 간다** (전수 조사 ①-4).
     *    원값을 그대로 복사하면 자동 ON·배율 0.4 일 때 **서버·지도는 6.2km, 앱은 15km** 로 갈라진다.
     *    앱은 `pickupRadiusKm` 으로 실제로 거른다(`Hwamul24Parser.kt`).
     *    셈은 서버·지도·필터 화면이 부르는 **그 함수**다 (규칙 ③).
     */
    {
        const eff = effectiveRadii(session.activeFilter);
        filter.pickupRadiusKm = eff.pickupRadiusKm;
        filter.destinationRadiusKm = eff.destinationRadiusKm;
        /* 📅 내일 콜은 줄이지 않은 기본 상차 반경 — 서버 판정과 같은 함수 · 비면 칸이 없다(앱은 pickupRadiusKm) */
        const reservedR = reservedPickupRadiusKmOf(session.baseFilter);
        if (reservedR != null) filter.reservedPickupRadiusKm = reservedR;
        /* 📅 내일 콜 상차 목록 — 집 둘레 같은 반경 안의 동(판정과 같은 집 · 반경) · 집이 없으면 칸이 없다(앱은 옛 길) */
        if (reserved) {
            filter.reservedPickupKeywords = reserved.keywords;
            filter.reservedPickupGroups = reserved.groups;
        }
    }
    /* 🎯 앱은 «어디로 가나» 하나만 안다 — 복귀면 집 시가 간다 (조사 ①-1 · 파생 `goalCity`) */
    if (session.activeFilter.goalCity) filter.destinationCity = session.activeFilter.goalCity;

    /**
     * 🔒 **지금 이 폰이 심사 중인 콜이 있나** — «잠김»의 까닭을 가른다 (기사님 · 실주행 오송읍).
     *
     * 🔴 `isActive=false` 는 **만석**이라는 뜻이다(`capacityFullHold` · 기사님 «1톤 두 개는 사고»).
     *    선점 중에도 그것을 끄면 앱은 둘을 구별 못 해, 목록에 콜이 보여도 **판정조차 안 한다** —
     *    오송읍 셋을 잡는 데 3분 25초가 걸렸다(04:58 · 「🔒 평가 보류」가 10초마다).
     *    이 칸이 있으면 앱은 **판정은 해 두고 클릭만 미뤄**, 앞 콜이 결재되는 즉시 다음을 잡는다.
     * 🔴 저장하지 않는다 — 심사 중인 콜을 쥔 `deviceEvaluatingMap` 에서 파생시킨다 (규칙 ③).
     */
    filter.evaluatingNow = !!(deviceId && session.deviceEvaluatingMap.get(deviceId));   // 응답 맨 위 칸으로도 간다 · 판 글자에는 안 든다 (scrap)

    // 🧭 경로 순서 맵 — 앱의 역주행·경로 밖 상차 차단 입력 (기사님 확정)
    //    첫짐(경로 없음)이면 빈 객체라 앱이 순서 검사를 건너뛴다. +2.7KB (동 211개 기준)
    //    🔴 키 이름은 orderKm — #78 이후 실리는 값이 «순서 전용»이라 이름을 한 벌로
    //       맞췄다 (기사님 확정 · 옛 이름 progressKm 은 트림용에만 남는다)
    filter.orderKm = buildAppOrderKm(session);

    // ⏱️ 배차망별 대기 시간 — 원천은 DB(user_settings), 원달앱은 받아 쓴다
    Object.assign(filter, readWaitTimes(userId));

    /* 🔒 콜 잡기를 멈추는 넷 — 까닭은 폰 문(scrap)의 로그 자리에 적혀 있다 · 넷 다 같은 순서로 본다 */
    const holds: AppFilterHolds = {
        bootstrapping: !!session.isBootstrapping,
        capacityFull: capacityFullHold(session.activeFilter),
        notRestored: !session.isRestored,
        blocker: callFilterBlocker(session.activeFilter) || null,
    };
    if (holds.bootstrapping || holds.capacityFull || holds.notRestored || holds.blocker) filter.isActive = false;
    return { filter, holds };
}
