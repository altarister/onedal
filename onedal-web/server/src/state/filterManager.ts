/**
 * filterManager.ts — 필터 변경의 단일 진입점 (완전 격리 아키텍처 v2)
 * 
 * 두 개의 명확한 함수로 분리되어 있습니다:
 *   1. saveBaseFilter()   — 톱니바퀴(SettingsModal) 전용. DB만 저장, activeFilter 불변.
 *   2. updateActiveFilter() — 돋보기(OrderFilterModal) + 시스템(State Machine) 전용. 메모리만 수정, DB 불변.
 * 
 * [핵심 원칙]
 * - baseFilter(DB)와 activeFilter(메모리)는 완전히 독립적입니다.
 * - 영구 설정을 바꿔도 현재 콜 잡는 중인 activeFilter에는 1도 영향을 주지 않습니다.
 * - activeFilter는 직접 수정하고 직접 읽는 1등 시민(first-class citizen)입니다.
 */

import { isHomeCallSince } from "@onedal/shared";
import { callTargetToday } from "../core/callTargetEvents";
import db from "../db";
import { getActiveCalls, computeLoadedPoints, buildOrderSync } from "../core/helpers";
import { stepRecordsOf } from "../services/stepSeeder";
import { OrderRepository } from "../repositories/OrderRepository";
import { SettingsRepository } from "../repositories/SettingsRepository";
import { getUserSession } from "./userSessionStore";
import type { AutoDispatchFilter, FlatValueKey } from "@onedal/shared";
import { DEFAULT_DETOUR_RADIUS_KM, goalZonesOf, withNearness, pickupAreaKey, dropoffPartsOf, lastDropOf, lineUntil, mergeDropoffGroups, isDeliveredCall, getEligibleVehicleTypes, getRemainingCapacityTypesByPoints, deriveDispatchPhase, businessDayKey, resetToBaseFilter, rateFloorsFrom, TRUCK_CAPACITY_SLOTS, FILTER_FIELDS, filterValuesFrom, QUAD_FIELDS, quadShapeFrom, pruneExcludedRegions, netForGoal, cityCenter, nearestDong, autoRadii, heldRadiusDistanceKm, progressAlongKm, RADIUS_BASE_KM_DEFAULT,
         EVALUATING_STATUSES, activeGoals, effectiveRadii, pickupListNeedsRebuild } from "@onedal/shared";
import type { } from "@onedal/shared";

// ─────────────────────────────────────────────────────────────
// 🎛️ 국면 옵션 (필터 확정안 v2 · 2026-08-21 전환 완료)
//
// **값 다섯의 유일한 원천은 user_filters 한 행이고, 컬럼·라벨의 원천은 FILTER_FIELDS 표다** (C3-3b · 2026-09-11).
// 옛 blob(user_filters.phase_settings)과 평면 4칸은 ④에서 손으로 철거했다 —
// 병행 절차: 새 그릇 → 이중 쓰기+비교(전수 스모크 일치) → 읽기 전환 → 철거.
// ⚠️ 실서버 data.db 는 배포 때 같은 손 순서 (배포 절차는 todo.md 🚀 절).
// ─────────────────────────────────────────────────────────────

/** 국면 5행을 새 그릇에 upsert — 컬럼 목록의 원천은 FILTER_FIELDS 표 */
/**
 * 🎯 **그물이 향하는 시 — «파생»이다** (2026-09-12 전수 조사 ①-1 · 규칙 ③).
 *
 * `callTarget` 이 HOME 이면 **집이 있는 시**, 아니면 기사님이 정한 `destinationCity`.
 * 🔴 **`destinationCity` 를 덮어쓰지 않는다.** 예전엔 `setCallTarget('HOME')` 이 그것을
 *    집 시로 갈아치워서, DEST 로 돌아올 때 원래 목적지가 **이미 없었다** — 파주가 광주로 굳었다.
 *    지금은 값을 안 건드리고 «어디를 볼지»만 여기서 매번 낸다. 목적지를 읽는 자리
 *    (첫짐 재계산·합짐 갱신·경유 조립·빈 차 경유·앱 피기백)가 **전부 이 함수**를 본다.
 * ⚠️ 집 주소에서 시·군을 못 뽑으면 `destinationCity` 로 물러선다 — 빈 그물을 만들지 않는다.
 */
/**
 * 🏠 **집이 있는 시 — «좌표»로 뽑는다** (2026-09-12 전수 조사 3단계 실측).
 *
 * 복귀 토글이 서버에 닿았는데 «완료» 줄이 없었다 — 집 주소에서 「시」로 끝나는 조각을
 * 못 찾아 거부됐다. **기사님 실제 주소도 `경기도 광주 초월 동광뷰엘`** 이라 같은 모양이었다.
 * 사람이 적는 주소는 «광주시»라고 안 적는다.
 * 🔴 집에는 좌표가 있다(`home_x/home_y`). `nearestDong` 이 좌표에서 «광주시»를 낸다 —
 *    그물이 이미 쓰는 그 표(`DONG_CENTROIDS`)다 (규칙 ③). 좌표가 없을 때만 주소 글자로 물러선다.
 * ⚠️ 서울이면 «서울 영등포구»처럼 구까지 온다 — `cityCenter` 가 그 이름을 그대로 받는다.
 */
export function homeCityOf(userId: string): string | null {
    const home = SettingsRepository.getHomeLocation(userId);
    if (!home) return null;
    if (Number.isFinite(home.x) && Number.isFinite(home.y)) {
        const region = nearestDong({ lng: home.x, lat: home.y }).region;
        if (region) return region;
    }
    return home.address?.split(/\s+/).find(p => p.endsWith('시') || p.endsWith('군')) ?? null;
}

export function goalCityOf(session: ReturnType<typeof getUserSession>, userId: string): string {
    const mine = session.activeFilter.destinationCity ?? '';
    if (session.activeFilter.callTarget !== 'HOME') return mine;
    return homeCityOf(userId) ?? mine;
}

/** 🎯 콜의 판 — 적힌 값. 비었으면(서버가 다시 켜져 메모리가 비었다) 하차지의 시로 대신한다 */
function boardOf(o: { goalCity?: string; dropoffX?: number; dropoffY?: number }): string | undefined {
    if (o.goalCity) return o.goalCity;
    return o.dropoffX != null && o.dropoffY != null ? nearestDong({ lng: o.dropoffX, lat: o.dropoffY }).region : undefined;
}

/**
 * 🏠 **살아 있는 목적지 전부** (전수표 #4 #5 #6 · 기사님 확정 2026-09-09 · 규칙은 `callNet.activeGoals` 한 곳).
 *
 * ```
 * 복귀 끔                  [목적지]
 * 복귀 켬 · 복귀콜 없음    [목적지, 집]   그동안 관내콜을 진행한다
 * 복귀 켬 · 복귀콜 잡음    [집]           목적지 콜은 뜨면 안 된다
 * ```
 *
 * 🔴 실물은 복귀를 켜는 순간 목적지가 집 하나였다(`goalCityOf`) — 복귀 대기 동안 목적지 콜이 안 떴다.
 * «복귀콜을 잡았나» = **복귀를 켠 뒤에 잡은** 콜 중 판이 집인 콜이 있나 (`homeCallsOf` · 🔄 #131).
 *    취소·방출한 콜은 안 센다 — 목업처럼 복귀콜을 취소하면 복귀 대기로 돌아간다.
 *    ⚠️ `myOrders` 에는 하차한 콜이 영업일 끝까지 남는다 — 아침 복귀콜이 저녁 복귀를 «잡음»으로 못 만드는 것은 켠 시각이 막는다.
 */
export function goalCitiesOf(session: ReturnType<typeof getUserSession>, userId: string): string[] {
    const dest = session.activeFilter.destinationCity ?? '';
    if (session.activeFilter.callTarget !== 'HOME') return dest ? [dest] : [];
    const home = homeCityOf(userId);
    if (!home) return dest ? [dest] : [];
    const homeCaught = homeCallsOf(session, userId, session.myOrders).length > 0;
    return [...new Set(activeGoals(dest, home, { homeOn: true, homeCaught }).filter(Boolean))];
}

/**
 * 🏠 **복귀콜만 골라낸다 — 복귀를 켠 뒤에 잡았고 판이 집인 콜** (버그 대장 #130 · #131 · 판단은 shared `isHomeCallSince`).
 * 🔴 **셋이 이 함수 하나로 묻는다** — 목적지 계산(`goalCitiesOf`) · 하차 완료 자동 순환(`dispatchEngine`).
 * 🔴 **이번 운행(`deckOfCycle`)으로 세지 않는다** — 그건 진행 중인 콜이 0건이면 빈 목록이라, 콜 0건 틈에 «안 잡음»이 됐다.
 *    켠 시각은 `call_target_events` 오늘 줄에서 읽는다 — 서버를 다시 띄워도 같다.
 */
export function homeCallsOf<T extends { status?: string; capturedAt?: string; goalCity?: string; dropoffX?: number; dropoffY?: number }>(
    session: ReturnType<typeof getUserSession>, userId: string, orders: T[],
): T[] {
    void session;
    const home = homeCityOf(userId);
    const { homeOnAt } = callTargetToday(userId, Date.now());
    return orders.filter(o => isHomeCallSince({ status: o.status, capturedAt: o.capturedAt, board: boardOf(o) }, homeOnAt, home));
}

/**
 * 🕸️ **그물이 만든 하차지 목록** — 서버도 실험실과 **같은 계산**을 쓴다
 *    (이식 C1-2 · 기사님 확정 2026-09-11 «실험실 것으로 통일» · 명세 §5).
 *
 * 앱이 보는 `destinationKeywords` 는 **«이 콜의 하차지가 내 그물 안인가»** 하나를 답한다
 * (`InsungParser.kt` 의 `anyHit(pureDropoffText, …)`). 실험실의 `dropIn` 과 같은 질문이라
 * 그대로 맞물린다 (규칙 ⑤-4 ⑤ — 읽는 곳을 먼저 확정했다).
 *
 * ```
 * 첫짐   line: null  · anchor: 내 위치       → 내 위치 원 ∪ 목적지 원 ∪ 마름모
 * 합짐   line: 지금 경로 · lastDrop: 라인 끝 → 라인 띠 ∪ 목적지 원 ∪ 마름모
 * ```
 *
 * 🔴 **못 그리면 옛 방식(도시 둘레)으로 물러선다** — 목적지를 모르거나(`cityCenter` 가
 *    좌표를 못 냄) 첫짐인데 내 위치를 모르면 그물의 꼭짓점이 없다. 그때 **비우지 않는다**:
 *    빈 목록은 «제한 없음»이 아니라 **고장**이고(루트 CLAUDE.md), 없는 값을 지어내지도
 *    않는다(규칙 ④). 잴 수 있는 방법으로 물러설 뿐이다.
 *
 * ⚠️ **잃는 것을 알고 고른 것이다** — 실험실은 동을 **중심점 하나**로 보고 옛 방식은
 *    **폴리곤 모양**으로 봤다. 면적이 넓은 읍·면은 가장자리가 걸쳐도 중심이 밖이면 빠진다
 *    (인천 조건 실측 45개 · 그중 30개가 읍·면). 차이는 `pnpm net:compare` 로 잰다.
 */
function netKeywordsOf(
    session: ReturnType<typeof getUserSession>,
    userId: string,
    city: string,
    radiusKm: number,
    /** 그 목적지의 조각 — 라인(종착지까지 자른 것) · 종착지 · 현위치 원을 넣나 · 🎯 가까이 옴 (shared `dropoffPartsOf` · 필터.md «하차 영역») */
    part: { line: Array<[number, number]> | null; lastDrop: { x: number; y: number } | null; withMe: boolean; near: boolean },
): { flat: string[]; grouped: Record<string, string[]>; byNet: boolean; pruned: number; progressKm: Record<string, number>;
    /** 🎯 목적지 원 반경(km) — `dstDiamKm / 2` · 가까이 온 목적지의 하차 목록이 쓰는 그 원이다. 콜의 판(`goalOfCall`)이 같은 원을 본다 */
    destRingKm: number } {
    const line = part.line;
    const excluded = session.activeFilter.excludedRegions ?? [];
    /** 🚫 제외로 **몇 개가 빠졌나** — 로그가 «왜 줄었는지»를 말할 수 있어야 한다 */
    const prune = (grouped: Record<string, string[]>, byNet: boolean) => {
        const before = new Set(Object.values(grouped).flat()).size;
        const kept = pruneExcludedRegions(grouped, excluded);
        return { ...kept, byNet, pruned: before - kept.flat.length };
    };
    /* 🔴 물러선 목록에는 라인이 없다 — 진행도도 없다 (지어내지 않는다 · 규칙 ④) */
    const fallback = () => ({ ...prune(getCityRegionsWithRadius(city, radiusKm).grouped, false), progressKm: {} as Record<string, number>, destRingKm: radiusKm });
    const goal = cityCenter(city);
    if (!Number.isFinite(goal.lng) || !Number.isFinite(goal.lat)) return fallback();

    /* 📍 그물의 꼭짓점은 «지금 기점» — 낡거나 빈 차의 가짜면 집 주소가 대신한다 (파생) */
    const me = originOf(session as Parameters<typeof originOf>[0]);
    if (!line && !me) return fallback();        // 첫짐인데 꼭짓점이 없다

    const quad = quadShapeFrom(session.activeFilter as any);
    /**
     * 📐 **반경 자동 맞춤** (이식 C4-12 · 2026-09-12 · 계획서 §C4-12 에 규칙 ⑤-4 다섯).
     *
     * 기사님: *"목적지와의 거리에 따라 … **자동으로 바뀌어 주면 좋겠다. 그래서 자동, 수동으로.**"*
     *
     * 🔴 **재는 축이 «마름모의 축»과 같아야 한다.** 마름모반경은 **축에서 좌우로** 재는
     *    값이니(`callNet.makeInQuad`), 자동이 맞출 거리도 그 축이다 —
     *    첫짐은 «내 위치 → 목적지», 합짐은 «마지막 하차지 → 목적지».
     *    다른 축을 재면 «맞췄다는데 안 맞는» 값이 된다.
     * 🔴 **계산은 `shared` 한 곳이다** — 관제웹 지도(`useCallNet`)가 **같은 함수**를 부른다.
     *    두 벌이면 «지도는 든다는데 판정은 탈락»이 된다 (규칙 ③).
     * ⚠️ **수동이면 손대지 않는다.** 그리고 거리를 못 재면 자동도 **받은 값 그대로** 둔다
     *    (`autoRadii` 안에서 걸러진다 · 규칙 ④).
     */
    /* 🔄 **2026-09-14 개정 — 거리는 하루에 한 번 잰다** (기사님 확정 · 필터.md §10-1 ③).
       들고 있으면 그것을 쓰고, 비어 있을 때만 «내 위치 → 목적지»로 잰다. 예전엔 합짐이면
       «마지막 하차지 → 목적지»로 매번 다시 재서 이천 중리동(1.2km)에서 목적 원이 0.3km 가 됐다
       — 관내콜도 가는 길의 좋은 콜도 못 받는다. 비우는 곳: 다시 구하기(`null`) · 목적지 변경
       (`updateActiveFilter`) · 영업일 전환(`resetToBaseFilter`). */
    const distanceKm = heldRadiusDistanceKm(session.activeFilter.radiusDistanceKm,
        me ? haversineKm(me.y, me.x, goal.lat, goal.lng) : null);
    const auto = session.activeFilter.radiusAuto
        ? autoRadii(distanceKm, {
            pickupRadiusKm: session.activeFilter.pickupRadiusKm ?? 10,
            destinationRadiusKm: radiusKm,
            quadRadiusKm: quad.quadRadiusKm,
            detourRadiusKm: session.activeFilter.detourRadiusKm ?? DEFAULT_DETOUR_RADIUS_KM,
        }, session.activeFilter.radiusBaseKm ?? RADIUS_BASE_KM_DEFAULT)
        : null;
    const params = {
        ...quad,
        ...(auto ? { quadRadiusKm: auto.quadRadiusKm } : {}),
        srcDiamKm: (auto ? auto.pickupRadiusKm : (session.activeFilter.pickupRadiusKm ?? 10)) * 2,
        dstDiamKm: (auto ? auto.destinationRadiusKm : radiusKm) * 2,
    };
    /**
     * 📏 **자동이 지금 얼마로 줄였나** — 화면이 손잡이에 그 값을 적을 수 있게 (이식 C4-12).
     *    🔴 기사님이 정한 원값(`pickupRadiusKm` 등)은 **안 건드린다** (규칙 ④) —
     *       배율만 따로 실어 보내고 곱하는 것은 화면이 한다.
     */
    /* 배율이 아니라 **거리**를 싣는다 — 셈은 `effectiveRadii` 한 곳 (전수 조사 2단계). 자동·수동 무관 */
    session.activeFilter.radiusDistanceKm = Number.isFinite(distanceKm as number) ? (distanceKm as number) : undefined;
    /**
     * 🎯 **목적지 가까이 옴 → 그 목적지 원에 걸친 동 전체** (기사님 확정 2026-09-15 · 필터.md «하차 영역»).
     *    관내를 따로 재지 않는다 — «가까이 옴»(`withNearness`)이 갈랐다. 상차 목록 동도 안 뺀다 (`mergeDropoffGroups`).
     *    걸침은 상차 목록과 같은 식이다 (`geoService.regionsTouchingAreaGrouped` — 격자 점 ∪ 동 꼭짓점).
     */
    if (part.near) {
        const ringKm = Math.max(0, params.dstDiamKm / 2);
        const grouped = regionsTouchingCircleGrouped({ lng: goal.lng, lat: goal.lat }, ringKm);
        if (!Object.keys(grouped).length) return fallback();
        return { ...prune(grouped, true), progressKm: {}, destRingKm: ringKm };
    }

    /* 🏁 마름모의 시작 — 그 목적지 콜의 마지막 하차지(`lastDropOf` · 부르는 쪽이 고른다) · 모르면 라인 끝 */
    const lastDrop = part.lastDrop
        ? { name: '마지막 하차지', lng: part.lastDrop.x, lat: part.lastDrop.y }
        : line && line.length >= 2
            ? { name: '마지막 하차지', lng: line[line.length - 1][0], lat: line[line.length - 1][1] }
            : null;
    const net = netForGoal(goal, {
        /* 🔷 **동선이면 경로를 안 본다** — 지도(`useCallNet`)와 같은 분기 (조사 ①-9).
           예전엔 서버가 이 값을 몰라 «동선»을 골라도 판정·앱 목록은 노선이었다 */
        line: session.activeFilter.routeMode === false ? null : line,
        lineRadiusKm: auto ? auto.detourRadiusKm : (session.activeFilter.detourRadiusKm ?? DEFAULT_DETOUR_RADIUS_KM),
        lastDrop,
        params,
        anchor: me ? { name: '내 위치', lng: me.x, lat: me.y } : { name: '내 위치', lng: goal.lng, lat: goal.lat },
        /* 🧩 **현위치 영역은 조각이 넣으라 할 때만** — 콜 없음 · 경로 생김(운행 전)이면 넣고 운행 뒤면 뺀다 (shared `dropoffPartsOf` · 필터.md «하차 영역») */
        me: part.withMe && me ? { name: '내 위치', lng: me.x, lat: me.y } : null,
    });
    /* 🔴 그물이 아무것도 못 담으면 그것도 «고장»이다 — 물러선다 */
    if (!net.pass.length) return fallback();

    const grouped: Record<string, string[]> = {};
    for (const d of net.pass) {
        const region = d.region ?? '기타 지역';
        (grouped[region] ??= []).push(d.name);
    }
    /**
     * 🧩 **경로 영역은 동 경계가 띠에 걸치면 넣는다** (기사님 결정 2026-09-14 «나» · 전수표 #26).
     *    그물은 동을 **중심점 하나**로 본다. 목업은 상차지 **좌표**로 재니 괜찮지만 스캔앱은 **지역명만** 본다 —
     *    «7지점» 03 곤지암성당은 경로에서 2.15km(띠 안)인데 곤지암읍 중심점이 5.36km 라 목록에 없어 막혔다.
     *    앱은 넉넉하게 올리고 판정이 가른다(규칙 ⑤) — 띠에 걸친 동을 더한다. 폭은 그물 라인과 같은 값(자동이면 줄인 값).
     */
    const lineUsed = session.activeFilter.routeMode === false ? null : line;
    const touch = lineUsed
        ? getDetourRegions(lineUsed.map(([x, y]) => ({ x, y })),
            auto ? auto.detourRadiusKm : (session.activeFilter.detourRadiusKm ?? DEFAULT_DETOUR_RADIUS_KM))
        : null;
    if (touch) for (const [region, names] of Object.entries(touch.grouped)) (grouped[region] ??= []).push(...names);
    for (const k of Object.keys(grouped)) grouped[k] = [...new Set(grouped[k])].sort();
    /**
     * 📏 **진행도도 같은 그물에서 낸다** (전수표 1단계 · 2026-09-14) — 라인 띠로만 든 동에 붙은
     *    «라인 시작부터 몇 km 지점인가»(`callNet.buildLineNet`). 목록과 진행도가 **한 벌**이라
     *    옛 경로 버퍼의 진행도로 새 목록의 동을 지우는 일이 없다. 같은 이름이 둘이면 먼 쪽 (옛 계산과 같은 규칙).
     */
    const progressKm: Record<string, number> = {};
    for (const d of net.pass) {
        if (d.progressKm == null) continue;
        const prev = progressKm[d.name];
        if (prev === undefined || d.progressKm > prev) progressKm[d.name] = d.progressKm;
    }
    /* 🧩 띠에 걸쳐 더한 동도 경로 위다 — 순서는 그 동의 경로 스냅점(순서 전용 값 · #78)으로 */
    /* 🔴 **그물이 이미 넣은 동에는 안 붙인다** — 목적지·마름모로 든 동은 «아직 안 간 곳»이라 진행도가 없다
          (`callNet.lineZoneOf` 의 `onlyByLine`). 붙이면 지나온 곳 빼기에 관고동·사음동이 먹혔다 (20:49:47) */
    const inNet = new Set(net.pass.map(d => d.name));
    if (touch) for (const [name, km] of Object.entries(touch.orderKm)) {
        if (inNet.has(name) || progressKm[name] !== undefined || !Number.isFinite(km)) continue;
        progressKm[name] = km;
    }
    return { ...prune(grouped, true), progressKm, destRingKm: Math.max(0, params.dstDiamKm / 2) };
}

/**
 * 🎯 **이 콜의 판 — 통과한 목적지** (전수표 #30 · 목업 `judgeGoals` 의 `preferName`: 집).
 *    목적지가 하나면 그것. 복귀 대기(둘)면 하차지가 **목적지 원 안이면 목적지(관내콜)**, 그 밖이면서 **집 그물** 안이면 집, 아니면 목적지.
 *    🔴 목적지 원을 먼저 본다 (2026-09-15 여섯 번째 바퀴 · 기사님 확정) — 집 그물은 꼭짓점이 «내 위치»인 마름모라 차 바로 옆 동(이천 중리동)이
 *       꼭짓점 근처에 들어, 관내콜이 «복귀콜 잡음»으로 적히고 그 뒤 관내콜이 막혔다. 원은 관내로 재는 그 원(`destRingKm`)이다 — 새 값 없음.
 *    ⚠️ 목적지 원이 집 쪽으로 걸치면 그 안의 집 방향 하차지도 관내콜로 적힌다 (원이 작아 손해가 작다 · onedal-49).
 *    ⚠️ 하차 좌표를 모르면 목적지로 둔다 — 모르는 값으로 «복귀콜을 잡았다»고 하지 않는다 (규칙 ⑤-2 · 복귀 대기가 더 넓다).
 */
export function goalOfCall(session: ReturnType<typeof getUserSession>, userId: string, order: { dropoffX?: number; dropoffY?: number }): string | null {
    const goals = goalCitiesOf(session, userId);
    if (goals.length <= 1) return goals[0] ?? null;
    const home = homeCityOf(userId);
    if (!home || !goals.includes(home) || order.dropoffX == null || order.dropoffY == null) return goals[0];
    const line = filterLineOf(session);
    const lineXY = line ? line.map(p => [p.x, p.y] as [number, number]) : null;
    const dest = goals.find(g => g !== home);
    if (dest) {
        const ringKm = netKeywordsOf(session, userId, dest, session.activeFilter.destinationRadiusKm || 0, { line: lineXY, lastDrop: null, withMe: false, near: false }).destRingKm;
        const c = cityCenter(dest);
        if (haversineKm(order.dropoffY, order.dropoffX, c.lat, c.lng) <= ringKm) return dest;
    }
    const homeNet = netKeywordsOf(session, userId, home, session.activeFilter.destinationRadiusKm || 0, { line: lineXY, lastDrop: null, withMe: !session.departedAt, near: false });
    return homeNet.flat.includes(nearestDong({ lng: order.dropoffX, lat: order.dropoffY }).name) ? home : goals[0];
}

/**
 * 🥣 **국면 행을 읽고 쓰던 셋이 여기 있었다** (`writePhaseRows` · `readPhaseRows` ·
 *    `loadPhaseRows` · 걷어냄 2026-09-11 · 이식 C3-3b).
 *
 * C3-3a 에서 값이 한 벌이 된 뒤로 이 셋이 하던 일은 **같은 값을 다섯 행에 쓰고
 * 다시 다섯을 읽어 한 벌로 접는 것**뿐이었다. 기사님: *"개선되어 중복인건 그냥 삭제 할꺼야."*
 *
 * 🔴 값 다섯은 이제 **평면 한 행**(`user_filters`)에 산다 — 저장은 `saveBaseFilter`,
 *    읽기는 `loadFilterValues` 하나다. 이름도 평면(앱 피기백) 것으로 통일됐다.
 */
export function loadFilterValues(userId: string): Record<FlatValueKey, any> {
    try {
        const row = db.prepare(`SELECT * FROM user_filters WHERE user_id = ?`).get(userId) as any;
        /* 🔴 행이 없거나 칸이 NULL 이면 표 기본값 — `Number(null) === 0` 을 안 밟는다 (#105) */
        return filterValuesFrom(row);
    } catch (e) {
        // 세션 생성을 막지 않는다 — 기본값이면 콜 잡기는 돌고, 값은 다음 저장에서 복원된다
        console.error(`🎛️ [필터 값] 읽기 실패 — 표 기본값으로 계속:`, (e as Error).message);
        return filterValuesFrom(null);
    }
}

import { logRoadmapEvent } from "../utils/roadmapLogger";
import { planArrivalStops } from '../services/routeComposer';
import { getCityRegionsWithRadius, pickupListFor, regionsTouchingCircleGrouped, cityAliases, getDetourRegions, unionRegions, getActivePolyline, trapsForKeywords, haversineKm, originOf } from "../services/geoService";

// ━━━ Prepared Statement 캐싱 (모듈 로드 시 1회만 실행) ━━━
// 노선·반경·할인율은 user_filters 의 평면 칸에 산다 (④에서 철거했다가 C3-3b 에서 한 벌로 돌아왔다).
// min_fare·max_fare 는 보류 칸 (앱 피기백 — 화물24 단가식 뒤 3단계 강등, 확정안 ①-삭제 #3)
/**
 * 📐 마름모 셋도 여기 산다 — **국면 밖 한 벌** (이식 C3-2 · 2026-09-11).
 *    컬럼 목록은 `QUAD_FIELDS` 표에서 뽑는다 (손으로 나열하지 않는다 — 규칙 ③).
 */
const QUAD_COLS = QUAD_FIELDS.map(f => f.col);
/** 🎛️ 값 다섯의 컬럼 — **표가 원천이다** (손으로 나열하지 않는다 · 규칙 ③) */
const VALUE_COLS = FILTER_FIELDS.map(f => f.col);

const stmtUpdateFilter = db.prepare(`
    UPDATE user_filters SET
        min_fare = ?, max_fare = ?, excluded_keywords = ?, is_active = ?,
        excluded_regions = ?,
        ${QUAD_COLS.map(c => `${c} = ?`).join(', ')},
        ${VALUE_COLS.map(c => `${c} = ?`).join(', ')},
        radius_auto = ?, radius_base_km = ?, accepted_vehicle_types = ?,
        route_mode = ?
    WHERE user_id = ?
`);

const stmtInsertFilter = db.prepare(`
    INSERT OR IGNORE INTO user_filters (user_id) VALUES (?)
`);

// ━━━ 내부 유틸: activeFilter 로그 출력 ━━━
function logActiveFilter(session: ReturnType<typeof getUserSession>, actionType: string, changes: Partial<AutoDispatchFilter>) {
    let schemaLogStr = "{\n";
    for (const key of Object.keys(session.activeFilter)) {
        const val = (session.activeFilter as any)[key];
        schemaLogStr += `  "${key}": ${JSON.stringify(val)},\n`;
    }
    schemaLogStr += "}";

    logRoadmapEvent(
        "서버", 
        `[FilterManager] 필터 변경 발생! (${actionType})\n` +
        ` - 변경 요청된 값: ${JSON.stringify(changes)}\n` +
        ` - 반영 후 최종 동작 필터(activeFilter):\n${schemaLogStr}`
    );
}

// ━━━ 내부 유틸: 파생 데이터(destinationKeywords, allowedVehicleTypes) 재계산 ━━━
function recalculateDerivedFields(session: ReturnType<typeof getUserSession>, changes: Partial<AutoDispatchFilter>, userId: string) {
    /* 🎯 화면·앱이 «지금 그물이 어디를 보나»를 알게 — 파생 · 읽기 전용 (조사 ①-1) */
    session.activeFilter.goalCity = goalCityOf(session, userId) || undefined;
    /* 🏠 살아 있는 목적지 전부 — 지도가 목적지마다 그물을 그린다 (전수표 #6) */
    session.activeFilter.goalCities = goalCitiesOf(session, userId);
    /**
     * 차종별 하한 단가표는 **콜할인율에서만 파생된다** (docs/지금/필터.md §4).
     *
     * 관제웹은 `callDiscountPct` 하나만 보내고 표는 만들지 않는다 — 같은 표를 두 곳에서
     * 만들면 한쪽만 고쳐진다(경유 4벌·상태목록 3벌과 같은 사고). 원천은
     * `user_filters.call_discount_pct` 한 벌이고, 여기가 그것을 표로 펼치는 유일한 자리다.
     */
    if ('callDiscountPct' in changes) {
        // 요율·수수료의 원천은 DB 다 (설정 화면에서 기사님이 바꾼다).
        const pricing = SettingsRepository.loadPricingConfig(userId);
        session.activeFilter.ratePerKm = rateFloorsFrom(
            changes.callDiscountPct ?? 10,
            pricing.vehicleRates,
            pricing.agencyFeePercent,
        );
    }

    /**
     * [최적화] 지리 연산은 도시·반경이 **실제로 바뀐 경우에만** 다시 돈다.
     * `isActive`·`minFare` 같은 단순 변경에는 캐시된 키워드를 그대로 쓴다.
     *
     * ⚠️ 예전 주석은 이 연산을 **"~7초"** 라고 적어 뒀는데, 2026-08-14 실측은 이렇다:
     *     `파주시 0km` 1ms · `용인시 10km` 13ms · `파주시 10km` 42ms · `서울 0km` 0ms
     * 7초는 부팅 때 `f.simplified`(200m) 캐시를 넣기 **전** 숫자다(1415ms → 13ms 기록 참조).
     * 낡은 경고를 믿고 판단하면 **없는 위험 때문에 기능을 포기**하게 된다 — 실제로 그랬다.
     */
    /**
     * 🚫 **제외 지역이 바뀌어도 다시 만든다** (이식 C2-2 · 2026-09-11 실측).
     *    처음엔 이 조건에 없어서 서울을 통째로 빼고 저장했는데 **「도착목표 298개 동」이
     *    그대로였다** — DB 에도 남고 화면 칩도 생겼는데 판정이 쓰는 목록만 옛것이었다.
     *    규칙 ⑤-4 ④ 가 금지하는 «화면이 조용히 거짓말하는» 모양이다.
     */
    const needsGeoRecalc =
        'destinationCity' in changes ||
        'callTarget' in changes ||          // 🎯 타겟이 바뀌면 그물이 향하는 시가 바뀐다 (조사 ①-1)
        'routeMode' in changes ||           // 🛣️🔷 노선/동선이 바뀌면 그물의 모양이 바뀐다 (조사 ①-9)
        'destinationRadiusKm' in changes ||
        'excludedRegions' in changes ||
        /* 📐 **모드를 바꾸면 반경이 통째로 달라진다** — 그물을 다시 그려야 한다 (이식 C4-12).
              안 넣었다가 실측에서 «자동을 눌렀는데 164동 그대로»가 났다 (규칙 ⑤-4 ④). */
        'radiusAuto' in changes ||
        'radiusBaseKm' in changes ||
        /* 📏 [↻ 다시 구하기] — 들고 있던 거리를 비웠으니 지금 위치로 다시 재고 그물을 다시 그린다 (2026-09-14) */
        'radiusDistanceKm' in changes ||
        /**
         * 🕸️ **그물의 재료 넷** (2026-09-12 전수 조사 ①-3). `netKeywordsOf` 가 실제로 읽는
         *    입력인데 여기 없어서 **바꾸고 💾 해도 `destinationKeywords` 가 옛값**이었다 —
         *    지도(클라)만 바뀌어 «지도는 든다는데 앱은 안 잡는다». 라인반경은 합짐 전용
         *    `refreshDetourIfNeeded` 가 따로 건진다.
         */
        'pickupRadiusKm' in changes ||
        'srcAngleDeg' in changes ||
        'dstAngleDeg' in changes ||
        'quadRadiusKm' in changes ||
        (!session.activeFilter.destinationKeywords || session.activeFilter.destinationKeywords.length === 0);

    if (changes.destinationKeywords) {
        /**
         * 명시적으로 키워드가 전달된 경우 (합짐 경유 · 투트랙 등) → 키워드는 그대로 쓴다.
         *
         * 🔴 2026-08-12 — 다만 **시 별칭은 같이 안 오면 반드시 다시 만든다.**
         *
         * 첫짐에도 별칭을 싣기 시작하면서 생긴 구멍이다. 예전에는 첫짐 별칭이 늘 비어 있어
         * 앱의 2단계 필터가 아예 안 돌았으므로 옛 값이 남아도 무해했다. 이제는 아니다.
         *
         * 옛 `startTwoTrack`(철거됨 · 지금은 `setCallTarget`/`syncDetourFilter`)은
         * `destinationKeywords` 만 넘겼다. 그러면 스프레드(`...changes`)가
         * `customCityFilters` 를 안 건드려 **직전 경유의 별칭이 그대로 남는다.**
         * 앱은 "시가 맞고 동도 맞아야 통과"로 판정하므로, 엉뚱한 시 목록을 들고 있으면
         * 멀쩡한 투트랙 콜을 전부 걸러낸다 — 조용히, 이유도 안 남기고.
         *
         * 별칭을 못 만들면 **비운다.** 옛 값을 남기느니 2단계 필터가 안 도는 편이 낫다
         * (동 이름만 보는 것 = 예전 동작). 있지도 않은 근거로 거르는 것이 더 나쁘다.
         */
        if (!changes.customCityFilters) {
            const groups = changes.destinationGroups ?? {};
            const aliases = new Set<string>();
            for (const parent of Object.keys(groups)) {
                for (const a of cityAliases(parent)) aliases.add(a);
            }
            session.activeFilter.customCityFilters = Array.from(aliases);
        }
    } else if (goalCityOf(session, userId) && needsGeoRecalc) {
        // 도시명/반경/타겟이 변경되었거나 키워드가 아직 계산되지 않은 경우에만 무거운 연산 수행
        /* 🎯 목적지는 «파생»이다 — HOME 이면 집 시 (조사 ①-1) */
        const city = goalCityOf(session, userId);
        const radius = session.activeFilter.destinationRadiusKm || 0;
        console.log(`🗺️ [FilterManager] 지리 연산 트리거 (city=${city}, radius=${radius}km)`);
        /**
         * 🕸️ **그물이 목록을 만든다** (이식 C1-2) — 화면이 그리는 그 계산이다.
         *    제외 지역은 `netKeywordsOf` 안에서 `pruneExcludedRegions` 한 곳이 뺀다 (규칙 ③).
         */
        /* 🏠 살아 있는 목적지마다 — 복귀 대기면 목적지 ∪ 집 (전수표 #15) */
        /**
         * 🧵 **콜을 쥐었으면 얼린 라인으로 만든다** (2026-09-14). 예전엔 `null` 이라 복귀를 켜거나 각도·반경을 바꾸면
         *    다음 KEEP·하차까지 **경로 영역이 빠진 목록**이 폰에 갔다 — 뒤따라 라인으로 다시 만드는 길이 없다.
         *    진행도도 함께 기억한다 — `rebuildNetFilter` 와 같은 모양 (지나온 곳 빼기가 이 목록을 본다)
         */
        const line = filterLineOf(session);
        const { flat, grouped, byNet, pruned, goals, progressKm } = netOfGoals(session, userId,
            line ? line.map(p => [p.x, p.y] as [number, number]) : null);
        rememberDetourProgress(session, line ? progressOf(progressKm) : null);
        const customCityFilters = [...new Set(goals.flatMap(g => getCityRegionsWithRadius(g, radius).customCityFilters))];
        console.log(`🕸️ [FilterManager] ${byNet ? '그물' : '도시 둘레(물러섬)'} → 지역 ${flat.length}개`
            + (pruned > 0 ? ` (제외로 ${pruned}개 뺌)` : ''));
        session.activeFilter.destinationKeywords = flat;
        session.activeFilter.destinationGroups = grouped;
        /**
         * 🔴 2026-08-12 — 첫짐에도 **시 별칭**을 실어 보낸다.
         *
         * 예전에는 여기서 안 채워서 앱의 2단계 필터(`시 + 동` 교차 확인)가
         * `customCityFilters.isNotEmpty()` 조건에 걸려 **아예 돌지 않았다.**
         * 동 이름만 보고 판정했고, 수도권 안에만 같은 이름의 동이 97개 있다 —
         * 파주 필터에 서울 서대문구 `신촌동` 콜이 그대로 통과했다.
         */
        session.activeFilter.customCityFilters = customCityFilters;
    } else if ('destinationCity' in changes && !changes.destinationCity) {
        /**
         * 🔴 **도시를 "지웠을 때"만 경유도 지운다** (todo A번 · 2026-08-14 부터 미수정 → 08-22 수정).
         *
         * 예전 조건은 `!session.activeFilter.destinationCity` — *"도시가 **비어 있으면**"* 이었다.
         * 그래서 **도시와 무관한 변경**(최저 운임·콜 잡기 껐다 켜기·GPS 파생 재계산)에도
         * 경유 키워드가 통째로 날아갔다.
         *
         * 🔴 만드는 쪽과 지우는 쪽이 서로 다른 것을 보고 있었다:
         *    KEEP → `syncDetourFilter` 는 **경로 기반**으로 꽂는다 (도시를 안 본다)
         *    그 뒤 아무 변경 → 여기서 *"도시가 비었네"* → 전멸
         *
         * 그리고 당시 장부(`user_filter_phases`)에선 **합짐 국면은 목적지 도시가 원래 비어 있었다** —
         * 즉 첫짐을 KEEP 해서 합짐으로 넘어가는 **정상 흐름이 곧 그 조건**이었다.
         * (지금은 행이 하나라 그 조건이 성립하지 않는다 — 사고 기록으로 남긴다 · C3-3b)
         * 경유가 0개가 되면 앱은 아무 콜도 안 올린다 — 화면엔 에러가 없고 **조용히 멈춘다.**
         * (CLAUDE.md: *"빈 필터는 '제한 없음'이 아니라 고장이다"*)
         *
         * 2026-08-14 에 GPS 이동이 이 가지를 밟을 뻔해 전용 통로(`trimTraveled`)로 피했는데,
         * 가지 자체는 남아 있었다. 이제 **기사님이 도시를 지운 그 순간**에만 걸린다.
         */
        session.activeFilter.destinationKeywords = [];
        session.activeFilter.destinationGroups = {};
        session.activeFilter.customCityFilters = [];
    }
    // else: 도시/반경 변경 없음 → 기존 캐시된 destinationKeywords 유지 (이벤트 루프 보호)

    // 🔴 allowedVehicleTypes — 예전에는 명시적으로 안 넘기면 **첫짐 목록으로 리셋**했다.
    //
    //     if (!changes.allowedVehicleTypes)
    //         = getEligibleVehicleTypes(내 차종)   ← 만재든 아니든 전 차종 허용
    //
    // 그래서 합짐 도중 경유가 갱신될 때마다(syncDetourFilter 는 키워드만 넘긴다)
    // **적재 용량 제한이 조용히 풀렸다.** 라보 2개를 싣고도 1t 콜을 잡으러 가는 상태가 된다.
    // 실측: 상태 복구가 [오토바이, 다마스, 승용차] 로 좁혀 놓은 직후 경유 갱신 한 번에
    //       5종 전체로 되돌아갔다 (2026-08-10 스모크).
    //
    // 이슈 W·S 에서 세운 원칙과 같다 — **상태를 저장하지 말고 데이터에서 파생시킨다.**
    // 지금 실려 있는 짐이 진실이므로 거기서 매번 다시 구한다.
    if (!changes.allowedVehicleTypes) {
        const myVehicle = session.userVehicleType || '1t';
        const loaded = getActiveCalls(session);
        /**
         * 🚚 **기사님이 «받겠다»고 고른 것으로 한 번 더 좁힌다** (이식 C4-6b · 2026-09-12).
         *
         * 기사님: *"내 차가 1톤이지만 **라보 다마스 짐만 받겠다** … 합짐을 위해 필요."*
         *
         * 🔴 **두 질문을 갈라 둔 이유가 여기 있다** (규칙 ⑤-4 ⑤):
         *      · `acceptedVehicleTypes` 는 **기사님이 정한다** — 짐이 오가도 안 바뀐다
         *      · `allowedVehicleTypes`  는 **서버가 파생한다** — 콜마다 다시 난다
         *    한 칸에 겹쳐 두었더니 경유가 갱신될 때마다 기사님이 좁혀 둔 것이 풀려
         *    *"라보 2개를 싣고도 1t 콜을 잡으러 가는"* 상태가 됐다 (2026-08-10 스모크).
         * 🔴 **비어 있으면 «제한 없음»** — 새 칸이 생겨도 아무것도 안 바뀌는 것이 기본이다.
         * ⚠️ **교집합이 비면 그것이 «만재»다** — 지어내서 채우지 않는다 (규칙 ④).
         */
        const accepted = session.activeFilter.acceptedVehicleTypes ?? [];
        const narrow = (types: string[]) =>
            accepted.length === 0 ? types : types.filter(t => accepted.includes(t));

        if (loaded.length === 0) {
            session.activeFilter.allowedVehicleTypes = narrow(getEligibleVehicleTypes(myVehicle));
            session.capacityConfidence = 'CONFIRMED';   // 빈 차는 확실하다
            session.activeFilter.capacityConfidence = 'CONFIRMED';
            session.activeFilter.slotsUsed = 0;
        } else {
            // [Phase 8.4] 통화·현장에서 실제 짐 양을 알면 그걸 쓴다.
            // 차종만 보면 "1t 콜 = 30점 만재"로 추정하는데, 실제로 박스 1개면 2점이다.
            // 그 차이만큼 **놓치던 합짐 기회**가 열린다.
            // 🔄 파생 치환 ② — 적재의 재료도 새 장부에서
            const reports = new Map(loaded.map(c => [c.id, stepRecordsOf(c.id).reports]));
            const { points, confidence } = computeLoadedPoints(loaded, myVehicle, reports);
            session.activeFilter.allowedVehicleTypes = narrow(getRemainingCapacityTypesByPoints(myVehicle, points));
            session.capacityConfidence = confidence;
            session.activeFilter.capacityConfidence = confidence;

            /**
             * 관제탑 표시용 — 점수가 곧 **박스**다 (라면박스 축 2026-08-17).
             * 옛 축에서는 여기서 ÷7.5 로 칸 환산을 했는데, 그 잔재가 남아
             * "다마스 30박스 → 4/100박스"로 표시되는 사고가 났다 (기사님 실측 2026-08-17).
             *
             * 별도로 세지 않는 이유: 차종으로 다시 세면 통화로 확인한 실제 짐 양이
             * 반영되지 않아 **화면과 판정이 다른 말을 한다.** 판정이 쓰는 점수에서 파생시킨다.
             */
            session.activeFilter.slotsUsed = Math.min(
                TRUCK_CAPACITY_SLOTS,
                Math.round(points * 10) / 10
            );
        }
    }

    /**
     * 🔴 **마지막에 지나온 구간을 뺀다.**
     *
     * 여기가 유일한 자리인 이유: 경유를 다시 그리는 길이 여럿인데(경로 갱신·반경 변경·
     * 국면 전환), 어느 길로 오든 **다시 그리면 지나온 동이 되살아난다.**
     * 파생 계산의 끝에 두면 그 셋을 다 덮는다.
     */
    applyTraveledTrim(session);
}

/**
 * [GPS 전용] 지나온 구간을 빼고, 바뀌었으면 관제탑에 알린다.
 *
 * 🔴 **파생 재계산을 거치지 않는다.** `updateActiveFilter(userId, {})` 로 트리거하면
 *    그 안의 *"도착 도시가 비어 있으면 키워드를 지운다"* 가지에 걸려, 도시를 안 고른 채
 *    운행할 때 **0.5km 마다 경유가 통째로 지워진다.** 빈 필터는 "제한 없음"이 아니라
 *    고장이라 콜 잡기가 조용히 멈춘다.
 *
 *    지나온 구간 제거는 허용 차종·적재 칸을 다시 셀 이유가 없다. 필요한 건 숫자 비교뿐이다.
 */
export function trimTraveled(userId: string, io?: any): void {
    const session = getUserSession(userId);
    if (!applyTraveledTrim(session)) return;
    broadcastFilter(userId, session, io);
}

/**
 * 경유를 새로 그렸으면 **진행도도 같이 기억한다.**
 *
 * 🔴 키워드와 진행도는 **같은 입력에서 같이 나온 한 벌**이다. 한쪽만 갱신하면
 *    옛 경로의 진행도로 새 경로의 동을 지우게 된다 — 멀쩡한 지역이 조용히 사라진다.
 *    경유를 만드는 자리마다 이 함수를 부른다.
 */
export function rememberDetourProgress(
    session: ReturnType<typeof getUserSession>,
    regions: { progressKm?: Record<string, number>; orderKm?: Record<string, number>; flat?: string[] } | null,
) {
    session.detourProgressKm = regions?.progressKm ?? null;
    // 순서용 한 벌도 같은 순간에 — 트림용과 갈라지면 #78 이 되살아난다
    session.detourOrderKm = regions?.orderKm ?? null;
    /**
     * 🛣️ 경로 위 동 목록도 함께 기억한다 (2026-08-25).
     * ⚠️ **여기에는 경유만 넣는다.** 도착 목표에서 온 동을 섞으면 상차지 축이 뚫린다
     *    (`buildAppOrderKm` 주석 참고 — 2026-08-18 파주 사고와 같은 형태).
     */
    session.detourFlat = regions?.flat ?? null;
}

/**
 * 🧭 **앱에 내려보낼 경로 순서 맵** — 역주행·경로 밖 상차 차단용 (기사님 확정 2026-08-18)
 *
 * 실사고: 파주 도착 직전에 `초월읍(광주) → 금촌동(파주)` 콜이 앱 필터를 통과했다
 * (2026-08-18 08:50). 앱은 하차지만 보고 상차지를 아무도 안 봐서 — 78km 역주행 콜이었다.
 *
 * · 키를 **지금 목록(destinationKeywords)으로 좁힌다** — 세션의 순서 맵은
 *   지나온 동도 계속 들고 있어, 그대로 보내면 지나온 동이 "경로 위"로 남는다
 * · 값 없음(스냅 실패)은 **null** — "순서를 모른다"는 뜻이고 앱은 모르면 막지 않는다
 * · 경로가 없으면(첫짐) **빈 객체** — 앱이 순서 검사를 통째로 건너뛴다
 *
 * 🔴 **읽는 것은 `detourOrderKm`(순서 전용 · 순수 스냅점)이다** (#78 · 2026-08-30).
 *    전에는 트림용 `detourProgressKm` 을 그대로 썼다 — pad 가 하차원 판정까지 부풀려
 *    곤지암읍(실제 6km 길목)이 «Infinity → 경로 끝 19.2km»가 됐고, 성당→이천제일이
 *    "2.2km 후진"으로 차단됐다 (7지점 실폰 2회 재현 · `routeOrderKm.test.ts`).
 *    순서용에는 Infinity 가 없으므로 옛 «Infinity → 경로 끝» 치환도 함께 사라졌다 —
 *    하차원 안 동들도 각자의 실제 위치를 가져 서로의 순서가 살아 있다 (2026-08-18 에
 *    null 로 보내 판정이 죽었던 그 자리 — 지금은 유한한 실수가 나가므로 그 일이 없다).
 */
export function buildAppOrderKm(
    session: ReturnType<typeof getUserSession>,
): Record<string, number | null> {
    /**
     * 🔴 진행 중 경로가 없으면(활성 콜 0) 순서도 없다 (버그 대장 #39 · 2026-08-22).
     * 옛 사이클의 진행도 잔재를 내려보내면 앱 RouteOrderFilter 가 "경로 밖 상차지
     * 차단"을 **첫짐 탐색에** 발동한다 — 옛 경유 목록 밖 첫짐 후보가 전부 막힌다.
     * 원천(경로)이 없으면 파생도 빈 것이다 (규칙 ③).
     */
    if (getActiveCalls(session).length === 0) return {};
    const order = session.detourOrderKm;
    if (!order) return {};

    const out: Record<string, number | null> = {};
    for (const dong of session.activeFilter.destinationKeywords ?? []) {
        /**
         * 🔴 **경유에 없는 동은 내보내지 않는다** (2026-08-25).
         *
         * 목록에는 이제 도착 목표(첫짐의 «여주시») 에서 온 동이 섞여 있다. 그건
         * **하차지를 열려고** 넣은 것이지 «경로 위»라는 뜻이 아니다.
         *
         * 여기서 `null` 로 내보내면 앱의 `RouteOrderFilter` 가 키가 있다는 이유로
         * «상차지 순서 미상 — 통과» 로 읽어 **그 동에서 싣는 콜을 허용한다** —
         * 2026-08-18 파주 사고(78km 뒤로 돌아가 싣기)와 같은 형태다.
         *
         * ⚠️ **`order` 의 키로 거르면 안 된다.** `centroid` 가 없어 스냅에 실패한 동은
         *    경로 위인데도 순서 맵에 없다. 그 동은 `null`(«순서 미상 — 통과»)로 나가야
         *    맞다 — «모르는 것»과 «경로 밖»은 다르다. 그래서 경유 목록으로 거른다.
         */
        /* 🔄 **2026-09-14 개정 — 목록에 든 동은 다 싣는다. 경로 위가 아니면 `null`(순서 미상 → 통과).**
         *    기사님 결정: *"필터가 그렇게 디테일할 수 없다 — 그냥 올리고 판정에서 나쁜 점수를 받으면 기사는 선택하지 않는다."*
         *    위 주석의 옛 규칙(경로 밖 동은 빼서 «경로 밖 — 차단»)은 «7지점» 05(사음동 — 목적지 영역 안)를 막았다.
         *    뒤로 가는 상차는 이제 필터 영역이 뺀다(필터.md §5 «필터 영역» · 전수표 2단계). */
        const v = order[dong];
        // 유한하지 않은 값이 섞여 들면 «순서 미상 — 통과» — 느슨한 쪽이 안전하다 (규칙 ⑤)
        out[dong] = Number.isFinite(v) ? (v as number) : null;
    }
    return out;
}

/**
 * **지나온 구간을 필터에서 뺀다** — 경유를 다시 그리지 않고.
 *
 * 기사님: *"성남을 지났으면 이미 지나온 광주시·성남시 콜은 목록에서 뺀다. 뒤로 안 돌아가니까."*
 *
 * 경유를 만들 때 동마다 기록해 둔 진행도(`detourProgressKm`)와 지금 GPS 의 진행도를
 * 비교하기만 한다 — 실측 **0.14ms**. 예전 방식(경유 통째 재계산)은 173ms 였다.
 *
 * 안전 쪽으로 기운 규칙 셋. **일찍 빼면 잡을 수 있는 콜을 버린다:**
 *   ① 진행도를 **모르는 동은 남긴다**
 *   ② **전부 빠지면 아무것도 안 한다** — 빈 필터는 "제한 없음"이 아니라 **고장**이다
 *   ③ 동·시 묶음·별칭을 **한 벌로** 줄인다 (별칭이 남으면 앱의 2단계 필터가 어긋난다)
 */
export function applyTraveledTrim(session: ReturnType<typeof getUserSession>): boolean {
    /**
     * 🔴 **국면을 보지 않는다** (2026-08-14 정정).
     *
     * 처음에는 `dispatchPhase === 'DELIVERING'` 일 때만 돌렸다. 그런데 지나온 구간은
     * **국면과 무관하게 참이다** — 이미 지난 동네는 합짐이든 운행중이든 지난 동네다.
     * 게다가 도착 감지가 국면을 GATHERING 으로 떨어뜨리자 **달리는 중인데 제거가 멈췄다.**
     *
     * 조건은 데이터에 맡긴다: 진행도가 있고(= 경유를 그렸고) · 경로가 있고 · GPS 가 있으면 돈다.
     * 콜이 0건이면 경로가 없으니 자연히 안 돈다.
     */
    const progress = session.detourProgressKm;
    if (!progress) return false;

    /* 🛣️ 얼린 라인 위 GPS 진행도 — 그물이 동마다 붙인 진행도와 **같은 셈**(`progressAlongKm`)이다 (전수표 #19) */
    const polyline = filterLineOf(session);
    /**
     * 🧭 **지금 위치로만 뺀다** («7지점» 2026-09-14 20:49:47). 부팅 때 되살린 지난 바퀴 끝 점(16분 묵음)으로
     *    01 KEEP 순간 새 경로의 19.2km 까지를 «지나왔다»며 21 → 10곳으로 뺐다. 묵었거나 집 주소로 대신한 위치면 안 뺀다.
     */
    const here = originOf(session as Parameters<typeof originOf>[0]);
    const gps = here && !here.isFallback ? here : null;
    if (!polyline || !gps) return false;

    const at = progressAlongKm({ lng: gps.x, lat: gps.y }, polyline.map(p => [p.x, p.y] as [number, number]));
    if (at === null || at <= 0) return false;

    const before = session.activeFilter.destinationKeywords ?? [];
    if (before.length === 0) return false;

    // ① 진행도를 모르는 동은 남긴다
    const kept = new Set(before.filter(d => progress[d] === undefined || progress[d] >= at));
    if (kept.size === before.length) return false;   // 뺄 게 없다
    if (kept.size === 0) return false;               // ② 전부 빠진다 — 건드리지 않는다

    // ③ 셋을 한 벌로 줄인다
    const grouped: Record<string, string[]> = {};
    for (const [parent, dongs] of Object.entries(session.activeFilter.destinationGroups ?? {})) {
        const left = dongs.filter(d => kept.has(d));
        if (left.length > 0) grouped[parent] = left;
    }
    const aliases = new Set<string>();
    for (const parent of Object.keys(grouped)) {
        for (const a of cityAliases(parent)) aliases.add(a);
    }

    session.activeFilter.destinationKeywords = Array.from(kept).sort();
    session.activeFilter.destinationGroups = grouped;
    session.activeFilter.customCityFilters = Array.from(aliases);

    console.log(`🔄 [지나온 구간] ${at.toFixed(1)}km 지점 — 동 ${before.length} → ${kept.size}개 ` +
        `(뺀 ${before.length - kept.size}개)`);
    return true;
}

/**
 * 반경이 바뀌었으면 **경유 지역 목록도 다시 그린다.**
 *
 * 🔴 숫자만 바꾸고 지역 목록을 그대로 두면 화면과 판정이 다른 말을 한다 —
 *    "경유 5km" 라고 적혀 있는데 실제로는 옛 1km 목록으로 거르는 상태가 된다.
 *    조용히 틀리는 종류라 눈치채기까지 오래 걸린다.
 *
 * 합짐 모드가 아니면(경로가 없으면) 경유 자체가 없으므로 아무것도 하지 않는다.
 */
function refreshDetourIfNeeded(
    session: ReturnType<typeof getUserSession>,
    userId: string,
    before: { detourRadiusKm?: number, destinationRadiusKm?: number, excludedRegions?: string[] },
) {
    if (!session.activeFilter.isSharedMode) return;
    const cRadius = session.activeFilter.detourRadiusKm ?? DEFAULT_DETOUR_RADIUS_KM;
    const dRadius = session.activeFilter.destinationRadiusKm ?? 10;
    /**
     * 🚫 **제외 지역이 바뀌어도 다시 그린다** (이식 C2-2 · 2026-09-11).
     *    반경만 보면 합짐 국면에서 «제외했는데 경로 주변 목록은 그대로»가 된다 —
     *    첫짐에선 빠지는데 합짐에선 들어오는, 국면마다 다른 말을 하는 모양이다.
     */
    const exBefore = JSON.stringify(before.excludedRegions ?? []);
    const exNow = JSON.stringify(session.activeFilter.excludedRegions ?? []);
    if (cRadius === before.detourRadiusKm && dRadius === before.destinationRadiusKm && exBefore === exNow) return;

    /**
     * 🕸️ **합짐도 그물 한 곳이 만든다** (전수표 1단계 · 2026-09-14) — 옛 경로 버퍼(`recalculateDetourFilter`)를 걷었다.
     *    목록 · 묶음 · 별칭 · 진행도가 **한 벌**로 나온다. 라인은 KEEP 순간 얼린 경로다(`filterLineOf`).
     */
    const kept = netFilterOf(session, userId);
    if (!kept?.line) return;   // 경로가 아직 없다 — 없는 값을 지어내지 않는다
    rememberDetourProgress(session, progressOf(kept.progressKm));
    session.activeFilter.destinationKeywords = kept.flat;
    session.activeFilter.destinationGroups = kept.grouped;
    session.activeFilter.customCityFilters = kept.aliases;
    console.log(`🛣️ [경유 갱신] 라인 ${cRadius}km · 하차 ${dRadius}km → `
        + `${kept.byNet ? '그물' : '도시 둘레(물러섬)'} 지역 ${kept.flat.length}개`
        + (kept.pruned > 0 ? ` (제외로 ${kept.pruned}개 뺌)` : ''));
}

/**
 * 🛣️ **필터가 쓰는 라인 — KEEP 순간 얼린 경로** (기사님 확정 2026-09-14 · 전수표 #18).
 *
 * 기사님: *"운전이 경로를 벗어나든 말든 상관없다. 하차·취소·재탐색으로 다시 잴 필요가 없다 —
 * 기사는 어찌 되었건 그 목적지로 간다."* 그래서 경로가 다시 재져도(하차 완료·취소) 필터 라인은 안 바뀐다.
 * ⚠️ 얼린 값이 없으면(서버가 막 켜짐) **지금 경로**를 쓴다 — 메모리라 재시작하면 비어 있다.
 * 콜이 0건이면 라인이 없다.
 */
export function filterLineOf(session: ReturnType<typeof getUserSession>): Array<{ x: number; y: number }> | null {
    if (getActiveCalls(session).length === 0) return null;
    const line = session.filterLine ?? getActivePolyline(session);
    return line && line.length >= 2 ? line : null;
}

/** 진행도 한 벌 → 세션이 기억하는 세 칸 (트림용 · 앱 순서용 · 경로 위 목록). 셋이 같은 값에서 나온다 */
function progressOf(progressKm: Record<string, number>) {
    return { progressKm, orderKm: progressKm, flat: Object.keys(progressKm) };
}

/**
 * 🕸️ **지금 필터 목록 한 벌** — 목록을 만드는 모든 때(부팅 · 콜 0건 · KEEP · 경로 재계산 · 반경 변경)가 여기를 지난다.
 * 목적지를 모르면 `null`.
 */
function netFilterOf(session: ReturnType<typeof getUserSession>, userId: string) {
    const line = filterLineOf(session);
    const kept = netOfGoals(session, userId, line ? line.map(p => [p.x, p.y] as [number, number]) : null);
    if (!kept.goals.length) return null;
    /* 🔴 별칭은 목록에 든 시 전부에서 — 목적지 시 하나만 실으면 앱의 «시 + 동» 2단계가 경로 위 다른 시를 막는다 */
    const aliases = new Set<string>();
    for (const parent of Object.keys(kept.grouped)) for (const a of cityAliases(parent)) aliases.add(a);
    return { ...kept, aliases: [...aliases], line };
}

/**
 * 🔵 **하차 목록 — 살아 있는 목적지마다 조각을 만들어 합친다** (기사님 확정 2026-09-15 · `docs/지금/필터.md` «하차 영역»).
 *
 * 목적지 상태 · 가까이 옴은 `goalZonesNow`(상차 목록과 같은 값), 조각은 shared `dropoffPartsOf`,
 * 종착지는 경로 순서(`planArrivalStops` — 관제웹 `routeStops` 와 같은 순서)에서 그 목적지 콜의 마지막 하차지(`lastDropOf`),
 * 라인은 얼린 경로를 거기까지 자른 것(`lineUntil`). 합치기는 `mergeDropoffGroups` — 먼 목적지는 **상차 목록 동을 뺀다** · 가까이 온 목적지는 안 뺀다.
 * 🔴 상차 목록이 먼저 만들어져 있어야 한다 — `rebuildNetFilter` 가 그 순서로 부른다.
 * 관내는 따로 재지 않는다 — 가까이 옴이 갈랐다.
 */
function netOfGoals(session: ReturnType<typeof getUserSession>, userId: string, line: Array<[number, number]> | null) {
    const origin = originOf(session as Parameters<typeof originOf>[0]);
    const { zones, homeOn, homeCity } = goalZonesNow(session, userId, origin);
    const activeCalls = getActiveCalls(session);
    const stops = activeCalls.length ? planArrivalStops(activeCalls, origin) : [];
    const lineXY = line ? line.map(([x, y]) => ({ x, y })) : null;
    const radius = session.activeFilter.destinationRadiusKm || 0;
    const parts: Array<{ near: boolean; grouped: Record<string, string[]>; progressKm: Record<string, number> }> = [];
    let byNet = zones.length > 0, pruned = 0;
    for (const z of zones) {
        const lastDrop = z.state === 'idle' || z.near ? null
            : lastDropOf({ isHome: z.isHome, homeOn, homeCity, stops, calls: activeCalls });
        const goalLine = lineXY && lastDrop ? lineUntil(lineXY, lastDrop) : [];
        const shape = dropoffPartsOf(z.state, goalLine.length >= 2, !!z.near);
        const kept = netKeywordsOf(session, userId, z.city, radius, {
            line: shape.line ? goalLine.map(p => [p.x, p.y] as [number, number]) : null,
            lastDrop: shape.quadFrom === 'lastDrop' ? lastDrop : null,
            withMe: shape.me,
            near: !!z.near,
        });
        parts.push({ near: !!z.near, grouped: kept.grouped, progressKm: kept.progressKm });
        byNet = byNet && kept.byNet;
        pruned += kept.pruned;
    }
    const merged = mergeDropoffGroups(parts, session.activeFilter.pickupKeywords ?? []);
    return { flat: merged.flat, grouped: merged.grouped, byNet, pruned, progressKm: merged.progressKm, goals: zones.map(z => z.city) };
}

/**
 * 🕸️ **필터 목록을 다시 만든다 — 한 곳** (전수표 1단계 · 기사님 확정 2026-09-14).
 *
 * «7지점 한 바퀴» 06 콜(중리동 → 초월읍)이 도착지 축을 통과했다 — 부팅·0건은 시 경계 버퍼,
 * KEEP·경로 재계산은 경로 버퍼 ∪ 시 경계 버퍼(옛 계산)가 목록을 만들었고, 그물은 필터를 만질 때만 돌았다.
 * 이제 모든 때가 그물(`netKeywordsOf`)을 부른다.
 */
export function rebuildNetFilter(userId: string, io: any, pickupBuilt = false): void {
    const session = getUserSession(userId);
    /* 🔒 기사님이 손으로 고친 합짐 목록은 덮지 않는다 (2026-08-12) — 사이클이 끝나면 풀린다 */
    if (session.activeFilter.userOverrides && getActiveCalls(session).length > 0) {
        console.log(`🔒 [경유 고정] 기사님이 손으로 고친 필터라 자동 갱신을 건너뜁니다 ` +
            `(키워드 ${(session.activeFilter.destinationKeywords || []).length}개 유지)`);
        if (pickupBuilt) broadcastFilter(userId, session, io);   // 상차 목록은 이미 바뀌었다 — 그것은 알린다
        return;
    }
    /* 📋 **상차 목록을 먼저** — 하차 목록이 먼 목적지에서 상차 목록 동을 뺀다 (`mergeDropoffGroups` · 필터.md «하차 영역»).
       경로 · 출발 · 복귀가 바뀌는 길이 여기로 모인다. 방송은 아래 `updateActiveFilter` 가 한 번에 한다 */
    if (!pickupBuilt) rebuildPickupList(session, userId);
    const kept = netFilterOf(session, userId);
    if (!kept) {
        updateActiveFilter(userId, { destinationKeywords: [], destinationGroups: {} }, io);
        return;
    }
    // 🔴 진행도를 **키워드보다 먼저** 기억한다 — updateActiveFilter 끝의 트림이 이 진행도로 뺀다
    rememberDetourProgress(session, kept.line ? progressOf(kept.progressKm) : null);
    updateActiveFilter(userId, {
        destinationKeywords: kept.flat,
        destinationGroups: kept.grouped,
        customCityFilters: kept.aliases,
    }, io);
    console.log(`🕸️ [필터 목록] 목적지 ${kept.goals.join(' ∪ ')} · ${kept.line ? '라인(얼린 경로)' : '경로 없음'} · `
        + `${kept.byNet ? '그물' : '도시 둘레(물러섬)'} → ${kept.flat.length}개`
        + (kept.pruned > 0 ? ` (제외로 ${kept.pruned}개 뺌)` : ''));
}

/**
 * 🗺️ **키워드 트랩 — 한 곳** (regionMatch 사전 확장 · 기사님 확정 ④ · 상차 목록 2026-09-15).
 *    "남동"→"인천 남동구" 오탐의 원천 수리. 원천은 전국 지명 사전(geoService)이고, 앱·서버 매칭(anyRegionHit)이 이 트랩으로 부분 문자열 오탐을 거른다.
 *    📋 **상차 목록 ∪ 하차 목록으로 한 벌** — 막는 낱말이 늘 뿐이라 통과를 넓히지 않는다 (필터.md «상차 목록»).
 *    🔴 목록을 바꾸는 두 길(`updateActiveFilter` · `rebuildPickupList`)이 **이 함수 하나**를 부른다 — 계산이 두 벌이면 한쪽 목록을 빠뜨린다.
 */
function refreshKeywordTraps(session: ReturnType<typeof getUserSession>): void {
    const f = session.activeFilter;
    f.keywordTraps = trapsForKeywords([...new Set([...(f.destinationKeywords ?? []), ...(f.pickupKeywords ?? [])])]);
}

/**
 * 🎯 **지금 살아 있는 목적지 · 각자 상태 · 가까이 옴 — 한 곳** (기사님 확정 2026-09-15 · `docs/지금/필터.md` «필터 영역»).
 *    상차 목록(`rebuildPickupList`)과 하차 목록(`netOfGoals`)이 **같은 값**을 쓴다 — 관제웹 «상차» · «하차» 레이어도 같은 두 shared 함수다 (규칙 ③).
 *    반경은 `effectiveRadii` · 모양은 `quadShapeFrom`. 내 위치를 모르면 «가까이 옴»을 못 재 «멀다»로 둔다 (규칙 ④).
 */
function goalZonesNow(session: ReturnType<typeof getUserSession>, userId: string, me: { x: number; y: number } | null) {
    const f = session.activeFilter;
    const eff = effectiveRadii(f);
    const homeOn = f.callTarget === 'HOME';
    const homeCity = homeCityOf(userId);
    const homeCaught = homeOn && homeCallsOf(session, userId, session.myOrders).length > 0;
    const base = goalZonesOf({
        destinationCity: f.destinationCity,
        homeCity,
        homeOn,
        homeCaught,
        departed: !!session.departedAt,
        activeCalls: getActiveCalls(session),
    });
    const quad = quadShapeFrom(f as any);
    const zones = me ? withNearness(base, {
        me: { x: me.x, y: me.y },
        params: {
            srcAngleDeg: quad.srcAngleDeg, dstAngleDeg: quad.dstAngleDeg, quadRadiusKm: eff.quadRadiusKm,
            srcDiamKm: eff.pickupRadiusKm * 2, dstDiamKm: eff.destinationRadiusKm * 2,
        },
    }) : base;
    return { zones, homeOn, homeCity, homeCaught };
}

/**
 * 📋 **상차 목록을 만든다** (기사님 확정 2026-09-15 · `docs/지금/필터.md` «상차 영역»).
 *
 * 목적지 상태는 shared `goalZonesOf`, 계산은 `geoService.pickupListFor` 한 곳 — 여기서는 세션 값을 넘기기만 한다.
 * 관제웹 «상차» 레이어가 **같은 `goalZonesOf`** 로 그린다 (규칙 ③).
 * 반경은 앱·지도·그물이 쓰는 그 함수(`effectiveRadii`)에서 — 자동이면 줄인 값. «복귀콜을 잡았나»는 `homeCallsOf` 한 곳.
 * @returns 목록이 바뀌었나 (부르는 쪽이 관제웹에 알릴지 정한다)
 */
export function rebuildPickupList(session: ReturnType<typeof getUserSession>, userId: string): boolean {
    const me = originOf(session as Parameters<typeof originOf>[0]);
    if (!me) return false;
    const f = session.activeFilter;
    const eff = effectiveRadii(f);
    const line = f.routeMode === false ? null : filterLineOf(session);
    const { zones, homeOn, homeCity, homeCaught } = goalZonesNow(session, userId, me);
    const { list, shape } = pickupListFor({ me: { x: me.x, y: me.y }, radii: eff, line, zones });
    const prev = f.pickupKeywords;
    const prevArea = pickupAreaKey(f.pickupArea);
    session.pickupListAt = { x: me.x, y: me.y };
    f.pickupKeywords = list;
    /* 🗺️ 관제웹 «상차» · «하차» 레이어가 **같은 `goalZonesOf`** 를 부를 재료를 싣는다 (집 · 복귀 · 복귀콜 쥠) */
    f.pickupArea = { at: { x: me.x, y: me.y }, homeCity, homeOn, homeCaught, hasLine: !!line && line.length >= 2 };
    refreshKeywordTraps(session);
    /* 🔴 목록이 그대로여도 **지도 재료가 바뀌면** 알린다 — 안 그러면 복귀를 꺼도 지도가 옛 «복귀 켬»으로 그린다 (#146) */
    /* 🎯 목적지마다 가까이 옴이 바뀌어도 알린다 — 하차 목록이 가까이 온 목적지는 원 전체 · 먼 목적지는 빼기로 달라진다 */
    const nearKey = zones.map(z => `${z.city}:${z.near ? 1 : 0}`).join('|');
    const nearChanged = session.pickupNearKey !== nearKey;
    session.pickupNearKey = nearKey;
    const changed = !prev || prev.join(',') !== list.join(',') || prevArea !== pickupAreaKey(f.pickupArea) || nearChanged;
    if (changed) console.log(`📋 [상차 목록] ${zones.map(z => `${z.city}:${z.state}${z.near ? '·가까이' : ''}`).join(' · ') || '목적지 없음'} → `
        + `${shape === 'meLine' ? '내 위치 ∩ 라인' : shape === 'me' ? '내 위치' : '없음'} · 내 위치 ${eff.pickupRadiusKm.toFixed(1)}km${me.isFallback ? '(집 주소로 대신)' : ''} → ${list.length}곳`);
    return changed;
}

/** 📋 GPS 가 0.5km 넘게 움직였으면 상차 목록을 다시 만들고 관제웹에 알린다 (기사님 확정 · `PICKUP_LIST_MOVE_KM`) */
export function maybeRebuildPickupList(userId: string, io?: any): void {
    const session = getUserSession(userId);
    const me = originOf(session as Parameters<typeof originOf>[0]);
    if (!pickupListNeedsRebuild(session.pickupListAt, me ? { x: me.x, y: me.y } : null)) return;
    /* 🔵 상차 목록 · 지도 재료 · 가까이 옴이 바뀌면 **하차 목록도** — 먼 목적지는 상차 목록 동을 빼기 때문이다 (필터.md «하차 영역») */
    if (rebuildPickupList(session, userId)) rebuildNetFilter(userId, io, true);
}

/**
 * 🥣 **국면이 바뀔 때 그 벌을 펴던 고리가 여기 있었다**
 *    (`applyPhaseSettingsIfChanged` · 걷어냄 2026-09-11 · 이식 C3-3b).
 *
 * 국면이 바뀌면 그 국면의 값 다섯을 평면 필터에 얹었다. **값이 한 벌이 된 뒤로는
 * 얹어도 같은 값이라** 하는 일이 없었다 — 반경이 안 바뀌니 경유 재계산도 안 돌았다.
 *
 * 🔴 **함께 사라진 것**: `session.appliedPhaseKey`(어느 벌을 폈나) ·
 *    `applyPhaseToFilter`(이름 두 벌 사이 다리) · 단가표 재계산(할인율이 안 바뀐다).
 * ⚠️ **단가표는 여전히 할인율에서 파생된다** — `updateActiveFilter` 가 할인율 변경을
 *    볼 때 다시 만든다. 국면 전환이 아니라 **값이 바뀔 때** 도는 것이 맞다.
 */

/**
 * 🥣 **국면 하나만 저장하던 통로가 여기 있었다** (`savePhaseSettings` ·
 *    걷어냄 2026-09-11 · 이식 C3-3b).
 *
 * *"합짐 탭에서 하차 반경을 고쳤다고 첫짐 필터가 바뀌면 안 된다"* 는 이유로 있던 길이다.
 * **탭이 사라지고(C3-3a) 값이 한 벌이 되면서** 「그 국면이 될 때 꺼내 쓰는 값」 자체가 없다.
 *
 * 🔴 이제 값 다섯은 **평면 통로 하나**로 간다 — 오늘만이면 `updateActiveFilter`,
 *    앞으로 계속이면 `saveBaseFilter`. 마름모·제외지역이 이미 쓰던 그 길이다.
 *    소켓 `save-phase-settings` 도 함께 사라졌다.
 */

export const recalculateDetourFilter = (userId: string, detourRadiusKm: number, destinationRadiusKm?: number) => {
    const session = getUserSession(userId);
    let polylineToUse = null;
    const activeCalls = getActiveCalls(session);
    if (activeCalls.length > 0) {
        polylineToUse = activeCalls[activeCalls.length - 1].routePolyline;
    }

    if (polylineToUse && polylineToUse.length > 0) {
        const detour = getDetourRegions(polylineToUse, detourRadiusKm, destinationRadiusKm);
        if (detour && detour.flat.length > 0) {
            /**
             * 🎯 **지금 도착 목표를 경유에 합친다** (기사님 확정 2026-08-25).
             *
             * 기사님: *"가남→세종대왕면 , 가남→점동면 둘다 콜이 올라와야 한다고 난 보는데."*
             *
             * 경유만 쓰면 «목적지 안인데 경로에서 벗어난 곳»이 통째로 막힌다.
             * 저장하지 않고 **지금 쓰는 필터 값**에서 파생한다 (규칙 ③).
             *
             * 🔴 **`phaseSettings` 를 직접 읽지 않는다** (2026-08-25 18:58 실측 사고).
             *    한때 `phaseSettings.first` 를 읽었는데, **복귀행으로 바뀌자 판정만 옛
             *    노선 목적지(파주)를 계속 봤다.** 화면과 서버는 «복귀행 · 광주시»라고
             *    정확히 말하고 있었는데 광주로 내리는 콜이 전부 «도착지 밖»이 됐다.
             *
             *        ① 국면 설정  →  ② 평면 필터(activeFilter)  →  ③ 파생 목록
             *                applyPhaseToFilter        여기
             *
             *    ①과 ② 사이에 국면 전환·`override`·`auto` 파생이 있다. ③에서 ①을 직접
             *    읽으면 그 변환이 통째로 무시된다. **파생은 바로 윗단만 본다.**
             *    ①을 다시 해석하는 것은 `applyPhaseToFilter` 를 두 번째로 구현하는 것이다.
             *
             * 🔴 **조립은 여기 한 곳뿐이다.** 예전엔 `syncDetourFilter` 도 따로 조립해서,
             *    도착 목표를 한쪽에만 넣자 다른 쪽이 덮어썼다 (실측 12:35:50 —
             *    131개가 출발 순간 27개로 되돌아갔다). «경유 4벌» 과 같은 클래스다.
             */
            const merged = unionRegions(
                detour,
                goalCityOf(session, userId),   // 🎯 파생 목적지 (조사 ①-1)
                session.activeFilter.destinationRadiusKm ?? 0,
            );
            return {
                // 필터에 실을 것 — 경유 ∪ 도착 목표 (하차지를 연다)
                destinationKeywords: merged.flat,
                destinationGroups: merged.grouped,
                customCityFilters: merged.customCityFilters,
                /**
                 * 🛣️ **경로 위가 어디인가 — 경유만이다** (상차지 축의 원천).
                 *    도착 목표에서 온 동을 여기 섞으면 앱이 «순서 미상 — 통과» 로 읽어
                 *    그 동에서 싣는 콜을 허용한다 (2026-08-18 파주 사고와 같은 형태).
                 */
                progressKm: detour.progressKm,
                orderKm: detour.orderKm,
                flat: detour.flat,
            };
        }
    }
    return null;
};

// ━━━ 내부 유틸: 소켓 브로드캐스트 ━━━
function broadcastFilter(userId: string, session: ReturnType<typeof getUserSession>, io?: any) {
    // [Phase 6] 부트스트랩 중에는 중간 상태를 내보내지 않는다.
    // 복구 과정에서 updateActiveFilter 가 여러 번(상태 파생 → 경유 재계산) 호출되는데,
    // 그때마다 filter-updated 를 쏘면 관제탑이 첫짐 → 합짐으로 깜빡인다.
    // 확정된 필터는 부트스트랩 끝에서 filter-init 으로 한 번만 나간다.
    if (session.isBootstrapping) return;
    if (!io) return;

    const payload = {
        activeFilter: session.activeFilter,
        baseFilter: session.baseFilter,
        /* 🥣 국면별 설정 둘이 여기 실려 갔다 — 값이 한 벌이 되어 평면에 산다 (이식 C3-3b) */
    };

    /**
     * 🔴 **바뀐 게 없으면 안 보낸다** (2026-08-14).
     *
     * 이 함수는 `updateActiveFilter` 끝에서 불리고, 그 호출부가 **22곳**이다.
     * 한 동작(KEEP 하나)이 내부적으로 여러 단계를 거치면 그 수만큼 나갔다 —
     * 실측 **54ms 안에 15번**. 관제웹은 중간 상태를 다 받아 그때마다 다시 그렸다.
     *
     * 바로 위 `isBootstrapping` 방어가 같은 이유로 있었다("중간 상태를 내보내면 관제탑이
     * 첫짐 → 합짐으로 깜빡인다"). 그 생각을 부트스트랩 밖까지 민 것이다.
     * 판단은 **서버가 한 번** 한다 — 관제웹 여럿이 매번 비교하는 대신.
     */
    const json = JSON.stringify(payload);
    if (json === session.lastFilterJson) return;
    session.lastFilterJson = json;

    io.to(userId).emit("filter-updated", payload);
}

/**
 * [톱니바퀴 전용] 영구 설정(baseFilter)을 DB에 저장합니다.
 * 
 * ⚠️ 현재 콜 잡는 중인 activeFilter에는 절대 영향을 주지 않습니다.
 * "내일 출근할 때 적용될 설정"을 바꾸는 것입니다.
 * 
 * @param userId - 유저 ID
 * @param changes - 변경할 필터 필드 (Partial)
 */
export function saveBaseFilter(
    userId: string,
    changes: Partial<AutoDispatchFilter>,
    io?: any
): void {
    const session = getUserSession(userId);

    // baseFilter만 업데이트
    session.baseFilter = { ...session.baseFilter, ...changes };

    try {
        const b = session.baseFilter;

        stmtInsertFilter.run(userId);
        const quad = quadShapeFrom(b as any);       // 없거나 이상하면 기본값 (0 으로 안 읽는다)
        stmtUpdateFilter.run(
            b.minFare,
            b.maxFare,
            JSON.stringify(b.excludedKeywords || []),
            b.isActive ? 1 : 0,
            JSON.stringify(b.excludedRegions || []),
            ...QUAD_FIELDS.map(f => quad[f.path]),
            /* 🎛️ 값 다섯 — **같은 행에** 쓴다 (이식 C3-3b).
               예전엔 `writePhaseRows` 로 **국면 다섯 행에 같은 값을 다섯 번** 썼다 */
            ...(() => { const v = filterValuesFrom(b as any); return FILTER_FIELDS.map(f => v[f.path]); })(),
            /**
             * 📐🚚 **오늘 판 칸 셋** (2026-09-12 전수 조사 ①-5).
             *    `db.ts` 가 컬럼을 팠는데 여기 줄을 안 더해 **판 곳과 쓰는 곳이 갈라졌다** —
             *    💾 를 눌러도 안 남아 자정에 자동 모드와 받을 짐이 조용히 풀렸다
             *    (허용 차종이 풀린 2026-08-10 사고와 같은 모양).
             */
            b.radiusAuto ? 1 : 0,
            Number.isFinite(b.radiusBaseKm as number) ? b.radiusBaseKm : null,
            JSON.stringify(b.acceptedVehicleTypes || []),
            b.routeMode === false ? 0 : 1,   // 🛣️🔷 기본은 노선 (조사 ①-9)
            userId
        );
    } catch (e) {
        console.error(`[FilterManager] DB 저장 에러 (userId: ${userId}):`, e);
    }

    logRoadmapEvent(
        "서버",
        `[FilterManager] 영구 설정(baseFilter) DB 저장 완료\n` +
        ` - 변경된 값: ${JSON.stringify(changes)}\n` +
        ` - ⚠️ activeFilter는 변경하지 않음 (현재 콜 잡기에 영향 없음)`
    );

    // baseFilter 변경 내역을 프론트엔드에 실시간 전파 (초기화 버튼 클릭 시 최신값 반영을 위함)
    if (io) {
        broadcastFilter(userId, session, io);
    }
}

/**
 * [돋보기 + 시스템 전용] 현재 콜 잡는 중인 activeFilter를 직접 수정합니다.
 * 
 * DB에는 절대 접근하지 않습니다. 메모리 + 소켓 전파만 수행합니다.
 * OrderFilterModal(돋보기), dispatchEngine(State Machine), geoService(GPS 트림) 등에서 사용합니다.
 * 
 * @param userId - 유저 ID
 * @param changes - 변경할 필터 필드 (Partial)
 * @param io - Socket.io 인스턴스 (null이면 소켓 emit 생략)
 * @returns 변경 후의 최종 필터 상태
 */
export function updateActiveFilter(
    userId: string,
    changes: Partial<AutoDispatchFilter>,
    io?: any
): AutoDispatchFilter {
    const session = getUserSession(userId);

    // [중요] STANDBY 전환 감지: 다른 상태(GATHERING/DELIVERING)에서 STANDBY로 복귀할 때
    // 합짐 사이클에서 사용된 임시 값들(경유, 차종 제한 등)을 baseFilter 기준으로 리셋
    const previousPhase = session.activeFilter?.dispatchPhase ?? 'STANDBY';
    const nextPhase = changes.dispatchPhase ?? previousPhase;
    const isTransitionToEmpty = previousPhase !== 'STANDBY' && nextPhase === 'STANDBY';

    if (isTransitionToEmpty) {
        /**
         * 🔴 2026-08-12 — 여기서 `{...session.baseFilter}` 로 **통째로** 덮어쓰고 있었다.
         *
         * 바로 위 주석은 *"합짐 사이클에서 사용된 임시 값들(경유, 차종 제한 등)을 리셋"* 이라고
         * 적혀 있는데, 실제로는 **기사님이 오늘 정한 콜 잡기 설정까지 전부** 되돌렸다 —
         * 목적지 도시·최저 운임·상차 반경·블랙리스트.
         *
         * 기사님 의도: *"출근할 때 오늘 콜이 많이 나올 만한 곳으로 필터를 바꾸고,
         * 복귀콜이나 그런 것 하면 그 값으로 돌아오게."*
         * 그런데 코드는 **콜 하나 끝낼 때마다** 돌아갔다. 하루에 대여섯 번씩
         * "오늘은 용인 쪽으로" 가 사라진 것이다.
         *
         * 그래서 되돌리는 것은 **합짐 사이클이 만든 파생값**뿐이다.
         * 오늘 필터(baseFilter → activeFilter) 는 **영업일이 바뀔 때** 되돌아간다.
         *
         * 나머지 파생값(allowedVehicleTypes · isSharedMode · dispatchPhase)은
         * 아래 불변식 블록이 활성 콜 수에서 매번 다시 구하므로 여기서 손대지 않는다.
         */
        session.activeFilter = {
            ...session.activeFilter,
            // 경유는 이 사이클의 경로에서 나온 값이다 — 경로가 끝났으니 지운다.
            // 비워 두면 recalculateDerivedFields 가 **오늘의** destinationCity 로 다시 만든다
            destinationKeywords: [],
            destinationGroups: {},
            customCityFilters: [],
            // 진행도도 이 사이클의 경로에서 나온 값이다 — 경로가 끝났으니 지운다.
            // 남겨 두면 다음 운행 초반에 **옛 경로 기준으로** 동이 사라진다
            // (`detourProgressKm` 은 아래에서 지운다 — activeFilter 가 아니라 세션 필드다)
            // 수동 고정도 사이클과 함께 풀린다 (다음 콜 잡기는 자동 경유로 시작)
            userOverrides: false,
            isSharedMode: false,
            driverAction: 'WAITING',
            dispatchPhase: 'STANDBY',
        };
        session.detourProgressKm = null;
        session.filterLine = null;   // 🛣️ 얼린 필터 라인도 이 사이클의 것이다
        session.departedAt = null;   // 사이클이 끝났다 — 다음 운행은 다시 모으기부터
        session.arrivalFired.clear();      // 도착 감지 상태도 같은 수명이다 —
        session.arrivalNoticed.clear();    // 어제 찍은 정거장이 오늘 되살아나지 않는다
        // 👣 지나침 감시도 함께 비운다 — 남으면 다음 사이클 첫 틱에 **죽은 콜**로 발화한다
        session.passWatch.clear();
        session.arrivalHeld.clear();
        recalculateDerivedFields(session, {}, userId);
        console.log(`[FilterManager] STANDBY 복귀: 합짐 파생값만 되돌림 ` +
            `(오늘 필터 유지 — 도착 ${session.activeFilter.destinationCity}, 최저 ${session.activeFilter.minFare}원)`);
    } else {
        /**
         * 🔴 **반경이 바뀌면 지역 목록도 다시 그린다** (이식 C3-3b 에서 여기로 옮겼다).
         *
         * ⚠️ 예전엔 **국면이 바뀔 때**(`applyPhaseSettingsIfChanged`)와 **국면을 저장할 때**
         *    (`savePhaseSettings`) 둘이 이 일을 했다. 값이 한 벌이 되며 그 둘이 사라졌는데,
         *    **부르는 곳이 같이 없어져 경유가 안 다시 그려질 뻔했다** —
         *    `phaseUi.test.ts` 의 «반경이 바뀌면 지역 목록도 다시 그린다» 가 잡았다.
         *
         * 🔴 안 그리면 «하차 0km» 라고 적힌 채 **옛 목록으로 거른다** — 화면과 판정이
         *    다른 말을 하는, 조용히 틀리는 종류다.
         */
        const before = {
            detourRadiusKm: session.activeFilter.detourRadiusKm,
            destinationRadiusKm: session.activeFilter.destinationRadiusKm,
            excludedRegions: session.activeFilter.excludedRegions,
        };
        const prevDestinationCity = session.activeFilter.destinationCity;
        // 일반 변경: activeFilter에 직접 덮어쓰기
        session.activeFilter = { ...session.activeFilter, ...changes };
        /**
         * 📏 **기사님이 목적지를 바꾸면 자동 반경 거리를 비운다** (필터.md §10-1 ③ · 2026-09-14) — 다른 목적지의 거리를 쓰지 않는다.
         * 🔴 **값이 실제로 바뀔 때만** — 필터 화면의 저장은 목적지를 늘 같이 보낸다. 그걸로 비우면 달리는 중에 다시 재진다.
         * ⚠️ 복귀로 «그물이 보는 목적지»가 집이 되는 것(`callTarget`)은 여기를 안 지난다 — 기사님: *"그냥 두자"*.
         */
        if ('destinationCity' in changes && changes.destinationCity !== prevDestinationCity && !('radiusDistanceKm' in changes)) session.activeFilter.radiusDistanceKm = undefined;
        // 파생 데이터 재계산
        recalculateDerivedFields(session, changes, userId);
        refreshDetourIfNeeded(session, userId, before);
    }

    refreshKeywordTraps(session);

    // [자체 리뷰 B-③] isSharedMode 는 dispatchPhase 에서 파생되는 값이다.
    // (STANDBY = 첫짐 = 단독,  GATHERING/DELIVERING = 합짐)
    // 두 값을 따로 세팅해 오다 보니 서버 재시작 시 서로 어긋나는 사고(이슈 W)가 났다.
    // W 에서는 두 값을 손으로 맞춰놓기만 했을 뿐 어긋날 수 있는 구조는 그대로였으므로,
    // 여기 단일 진입점에서 불변식을 강제해 divergence 자체를 불가능하게 만든다.
    //
    // 필드 자체를 없애는 게 이상적이지만, 앱의 InsungParser 가 이 키를 파싱하고 있어
    // 페이로드 계약을 깨뜨리므로 값만 파생시킨다.
    //
    // 🔴 2026-08-10: 그런데 **뿌리가 여전히 저장된 값**이었다.
    //    isSharedMode 는 dispatchPhase 에서 파생시켜 놨는데, 정작 dispatchPhase 자체는
    //    누군가 명시적으로 바꿔줘야 하는 저장 상태였다.
    //    STANDBY 로 되돌리는 코드는 **취소 경로(StateMachine.rollbackOnCancel)에만** 있고
    //    **완료 경로에는 없었다.** 그래서 마지막 콜을 하차 완료해도
    //    `GATHERING` 이 남아 관제탑이 계속 "합짐 탐색중"이라 표시했다.
    //    (기사님: *"콜을 완료했는데 필터가 합짐 탐색중이야"*)
    //
    //    → dispatchPhase 도 **데이터에서 파생**시킨다. 지금 실린 콜 수가 진실이다.
    //      기존 전이(advanceOnKeep / rollbackOnCancel)와 결과가 같으므로 동작은 그대로다.
    const activeCount = getActiveCalls(session).length;

    /**
     * 실은 짐이 없으면 **'운행 중'도 '하차 중'도 될 수 없다.**
     *
     * 🔴 2026-08-14 — 예전에는 `DRIVING` 만 되돌렸다. 그래서 도착 감지가 켠 `UNLOADING` 이
     *    콜을 다 끝낸 뒤에도 남아, **빈 차인데 화면은 "하차 중"** 이라고 말했다.
     *    (도착 감지가 죽어 있던 동안에는 이 값이 켜질 일이 없어 드러나지 않았다)
     *    판정에는 영향이 없지만 — `deriveDispatchPhase` 는 콜 0건이면 무조건 STANDBY —
     *    화면이 사실과 다르게 말하고 다음 콜 잡기가 '하차 중'으로 시작한다.
     */
    if (activeCount === 0 && session.activeFilter.driverAction !== 'WAITING') {
        console.log(`🔗 [불변식] driverAction ${session.activeFilter.driverAction} → WAITING (활성 콜 0건)`);
        session.activeFilter.driverAction = 'WAITING';
    }

    /**
     * 🚀 출발을 눌렀다 — 관제웹은 `driverAction: 'DRIVING'` 으로 알린다.
     * 그 **사실**을 세션에 새긴다. 이후 정류장에서 driverAction 이 어떻게 바뀌든
     * 운행 중은 유지된다 (마지막 하차로 콜이 0건이 될 때까지).
     */
    let justDeparted = false;
    if (changes.driverAction === 'DRIVING' && !session.departedAt) {
        session.departedAt = Date.now();
        justDeparted = true;
        console.log(`🚀 [출발] 이제 모으지 않고 갑니다 — 운행 중 유지 (정류장에서 안 풀림)`);
    }
    // 실은 짐이 없으면 출발했을 리도 없다
    if (activeCount === 0 && session.departedAt) {
        session.departedAt = null;
    }
    // 경로가 끝났으면 진행도 잔재도 남기지 않는다 (#39 — departedAt 과 같은 수명.
    // 함수 첫머리의 STANDBY 복귀 정리는 changes 로 온 전환만 보고, 불변식이 아래에서
    // 파생으로 되돌리는 전환은 못 본다 — 그래서 여기서 데이터 기준으로 지운다)
    if (activeCount === 0 && session.detourProgressKm) {
        session.detourProgressKm = null;
    }

    const derivedPhase = deriveDispatchPhase(activeCount, !!session.departedAt);
    if (session.activeFilter.dispatchPhase !== derivedPhase) {
        console.log(`🔗 [불변식] dispatchPhase ${session.activeFilter.dispatchPhase} → ${derivedPhase} (활성 콜 ${activeCount}건)`);
        session.activeFilter.dispatchPhase = derivedPhase;
    }

    /**
     * 🔴 **선점 중인 콜이 없으면 콜 잡기는 켜져 있어야 한다** (2026-08-14).
     *
     * `isActive` 는 "지금 콜을 물어도 되는가" 다. `/orders/confirm` 이 콜을 선점하면서
     * `false` 로 끄고(결재 날 때까지 다른 콜을 안 물게), **결재가 나면** `rollbackOnCancel`
     * 이 다시 켠다.
     *
     * 그런데 결재를 거치지 않는 취소 경로가 셋이었다 — 화면 이탈 강제 취소 ·
     * `/detail` 35초 타임아웃 · 비상 보고. **끄기만 하고 켜지 않았다.**
     * 실측(22:04:07): 기사님이 앱에서 손으로 리스트로 빠져나오자 카드는 사라졌는데
     * **콜 잡기가 죽은 채로 남았다.** 화면에 아무 표시도 없어 왜 콜이 안 잡히는지 알 수 없다.
     *
     * 켜는 책임을 취소 경로마다 흩지 않는다 — **선점 중인 콜이 없다**는 데이터에서 파생시킨다.
     * 관제웹은 이 값을 보내지 않으므로(기사님이 손으로 끄는 스위치가 아니다) 안전하다.
     *
     * ⚠️ `pendingOrdersData.size` 로 세면 안 된다 — 그 캐시에는 **종료된 콜도 남아 있다**
     *    (`buildOrderSync` 가 거기서 terminated 를 뽑는다).
     *
     * 🔴 **«끝나지 않은 콜»로 세도 안 된다** (#80 · 2026-08-30). KEEP 된 콜은 캐시에
     *    **일부러 남는데**(dispatchEngine 승격 덮어쓰기 — 롤백 방지) 끝난 콜이 아니라서,
     *    그렇게 세면 콜을 하나라도 보유한 순간부터 이 불변식이 벙어리가 된다.
     *    실측 16:23:19 — 01·03 보유 중에 깨진 05를 강제 정리하자 **콜 잡기가 영영
     *    잠겼고**, 06·07은 «평가 보류»만 반복했다. 세어야 할 것은 **심사 중**
     *    (선점~결재 사이 · `EVALUATING_STATUSES`)뿐이다 — 확정 콜은 끝나지도 않았지만
     *    선점 중도 아니다 («한 값이 두 사실» — #76·#78·#79 와 같은 병).
     *
     * 🔴 **그런데 이 불변식은 «선점 잠금»만 푸는 것이다** (2026-08-30 코드리뷰).
     *    기사님이 기기를 「대기」로 두어 끈 것까지 되켜면 안 된다 —
     *    실제로 그래서 **«대기 = 필터 꺼짐» 이 거짓**이었고, 그 거짓을 용어집에 적을 뻔했다.
     *    `filterEnabledByMode` 가 «기사님 의도» 이고, 이 불변식은 그것을 **넘지 않는다**.
     *    (`undefined` 는 «켬» — 모드를 한 번도 안 고른 사용자는 예전 그대로 돈다)
     */
    const evaluating = Array.from(session.pendingOrdersData.values())
        .filter((o: any) => (EVALUATING_STATUSES as readonly string[]).includes(o.status));
    if (!session.activeFilter.isActive && evaluating.length === 0
        && session.filterEnabledByMode !== false) {
        console.log(`🔗 [불변식] isActive false → true (선점 중인 콜 0건 — 콜 잡기를 다시 켠다)`);
        session.activeFilter.isActive = true;
    }

    const derivedShared = derivedPhase !== 'STANDBY';
    if (session.activeFilter.isSharedMode !== derivedShared) {
        console.log(`🔗 [불변식] isSharedMode ${session.activeFilter.isSharedMode} → ${derivedShared} (dispatchPhase=${derivedPhase})`);
        session.activeFilter.isSharedMode = derivedShared;
    }

    /**
     * 🧭 **국면이 바뀌었으면 그 국면의 저장값을 평면에 펼친다.** (§2-4)
     *
     * 기사님: *"첫짐 도착반경 5km 로 콜을 잡다가 첫짐을 잡으면 … **저장된 합짐 도착반경 1km 를
     * 저장된 값에서 꺼내와** 콜을 잡고 싶은 거야."*
     *
     * ⚠️ **여기가 이 함수의 끝이어야 한다.** 조각을 펼친 뒤 `updateActiveFilter` 를 다시
     *    부르면 무한 루프가 된다. 파생값(키워드·별칭·허용차종)은 위에서 이미 계산됐고,
     *    반경이 바뀌면 경유는 다음 경로 계산 때 새 값으로 다시 그려진다.
     *
     * 🔴 **기사님이 방금 고친 값은 덮지 않는다.** `changes` 에 들어 있는 키는 건너뛴다 —
     *    안 그러면 필터 팝업에서 저장한 값이 곧바로 국면 기본값으로 되돌아간다.
     */

    logActiveFilter(session, "실시간 변경(activeFilter)", changes);
    broadcastFilter(userId, session, io);

    /**
     * 🧩 **출발하면 목록을 다시 만든다** — 내 영역 중 마름모 밖이 빠진다 (필터.md §5 «필터 영역»).
     *    지나온 곳 빼기는 진행도 있는 동만 빼서 이 일을 못 한다.
     *    ⚠️ 끝에서 한 번 — `rebuildNetFilter` 가 부르는 이 함수는 `driverAction` 을 안 실어 여기로 다시 안 온다.
     */
    if (justDeparted) rebuildNetFilter(userId, io);

    return session.activeFilter;
}


/**
 * **영업일이 바뀌었으면 오늘 필터를 기본 설정으로 되돌린다.**
 *
 * 기사님이 설명한 흐름 그대로다.
 *   *"사용자 설정에서 디폴트 값을 저장해 두고 세션이 바뀌거나 담날이 되거나 하면
 *     디폴트 값을 가져오고, 운행 시작 전 오늘 콜이 많이 나올 만한 곳으로 필터에 값을 바꾸고…"*
 *   *"아침에 출근시 필터 설정 없으면 그냥 디폴트 값으로 콜을 잡는 거고."*
 *
 * 경계는 **자정**이다 (기사님 결정 2026-08-12).
 * `isActive` 는 끄지 않는다 — 아침에는 기본 설정 그대로 콜 잡기를 시작하는 것이 맞다고 하셨다.
 *
 * ⚠️ 타이머를 두지 않는다. 접속·스크랩처럼 **세션을 건드리는 순간**에 확인한다.
 *    타이머는 서버가 자는 사이를 못 잡고, 프로세스가 죽으면 사라진다.
 *
 * @returns 되돌렸으면 true
 */
/**
 * 📊 하루의 성과를 설정 스냅샷과 함께 남긴다 — filter_day_results (필터 정의 4장).
 *
 * 근사 둘을 정직하게 적는다:
 *   · 매출·콜수는 **잡은 날(capturedAt KST)** 기준 — 자정을 넘긴 배송은 잡은 날에 계상
 *   · "그냥 매출"이다 (관제앱은 업무 단위 — 미수금·비용은 정산 페이지의 일)
 * INSERT OR IGNORE — 같은 날을 두 번 쓰지 않는다 (세션 여럿이 자정을 함께 넘어도 1회).
 */
export function recordDayResult(userId: string, day: string, settingsSnapshot: unknown): void {
    if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return;
    const range = [`${day}T00:00:00+09:00`, `${day}T24:00:00+09:00`]
        .map(t => new Date(t).toISOString());
    /**
     * 🔴 매출은 **하차한 날**의 것이다 (버그 대장 #38 · 2026-08-22).
     * 잡은 날(capturedAt) 기준으로 세면 자정을 걸친 콜(어제 잡고 새벽 하차)이
     * 어느 날 기록에도 안 잡힌다 — 어제 기록은 이미 확정됐고 오늘 집계는 잡은 날로
     * 거르니까. 관제앱은 업무 단위 — 콜의 끝은 하차고, 매출은 그날 것이다.
     * completedAt 이 없는 옛 행만 잡은 날로 근사한다 (지어내지 않는 폴백).
     */
    const done = db.prepare(`
        SELECT COALESCE(SUM(fare), 0) AS revenue, COUNT(*) AS calls FROM orders
        WHERE userId = ? AND status IN ('ORDER_DELIVERED', 'ORDER_COMPLETED')
          AND COALESCE(completedAt, capturedAt) >= ? AND COALESCE(completedAt, capturedAt) < ?`)
        .get(userId, range[0], range[1]) as any;
    const cancels: Record<string, number> = {};
    for (const r of db.prepare(`
        SELECT COALESCE(targetApp, 'insung') AS app, COUNT(*) AS n FROM orders
        WHERE userId = ? AND status = 'SAFE_CANCEL' AND capturedAt >= ? AND capturedAt < ?
        GROUP BY COALESCE(targetApp, 'insung')`).all(userId, range[0], range[1]) as any[]) {
        cancels[r.app] = r.n;
    }
    const colors: Record<string, number> = {};
    for (const r of db.prepare(`
        SELECT color, COUNT(*) AS n FROM order_judgments
        WHERE userId = ? AND judgedAt >= ? AND judgedAt < ? GROUP BY color`)
        .all(userId, range[0], range[1]) as any[]) {
        colors[r.color] = r.n;
    }
    db.prepare(`INSERT OR IGNORE INTO filter_day_results
                (user_id, day, settings, revenue, calls, cancels, colors)
                VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(userId, day, JSON.stringify(settingsSnapshot ?? {}),
           done.revenue, done.calls, JSON.stringify(cancels), JSON.stringify(colors));
    console.log(`📊 [성과 기록] ${day} — 매출 ${done.revenue.toLocaleString()}원 · 완료 ${done.calls}콜 · ` +
        `취소 ${JSON.stringify(cancels)} · 색 ${JSON.stringify(colors)}`);
}

export function ensureBusinessDay(userId: string, io?: any): boolean {
    const session = getUserSession(userId);
    const today = businessDayKey(Date.now());
    if (session.businessDay === today) return false;

    const yesterday = session.businessDay;
    session.businessDay = today;

    /**
     * 📊 **성과 기록 — 어제치를 리셋 전에 집계한다** (필터 정의 4장 · 확정안 구현 6).
     * "이 설정이 얼마를 벌었나" — 설정 스냅샷은 **리셋되기 전의 어제 오늘값**이어야
     * 하므로 아래 되돌리기보다 먼저 찍는다. 실패해도 전환은 계속 (계측이지 흐름이 아니다).
     */
    try { recordDayResult(userId, yesterday, session.activeFilter); }
    catch (e) { console.error('📊 [성과 기록] 실패:', (e as Error).message); }

    /**
     * 🖥️ **어제 하차분을 화면 사이클에서 정리한다** (버그 대장 #37 · 2026-08-22).
     *
     * `deckOfCycle`(기사님 확정 2026-08-19)은 *"진행 중이 남으면 하차한 콜도 같이
     * 보여준다"* — 6단계 채워진 모습을 보기 위한 화면 규칙이다. 사이클이 자정을
     * 걸치면(미하차 콜을 남기고 잠들면) 어제 하차한 콜이 오늘 "진행 중"으로 계속
     * 보였다. 재부팅 복구는 이미 영업일로 거르는데 **살아 있는 세션만 구멍**이었다.
     *
     * 하차한 날의 원천은 장부(orders.completedAt)다 — 오늘이 아니면 화면 재료
     * (메모리)에서만 뺀다. 미하차 콜·장부·매출은 건드리지 않는다 (규칙 ① ·
     * "상태는 콜별 즉시, 화면은 하루 단위" · 2026-09-15 «사이클 = 하루» — 자정 경계가 관제웹 `deckOfCycle` 과 같다).
     */
    try {
        const gone = session.myOrders.filter(o => {
            if (!isDeliveredCall(o)) return false;
            const row = db.prepare(`SELECT completedAt FROM orders WHERE id = ? AND userId = ?`)
                .get(o.id, userId) as { completedAt?: string } | undefined;
            return !row?.completedAt || businessDayKey(Date.parse(row.completedAt)) !== today;
        });
        if (gone.length) {
            session.myOrders = session.myOrders.filter(o => !gone.includes(o));
            for (const o of gone) session.pendingOrdersData.delete(o.id);
            console.log(`🌅 [영업일 전환] 어제 하차 완료 ${gone.length}건을 화면 사이클에서 정리 (장부·매출은 그대로)`);
            if (io) io.to(userId).emit("sync-active-orders", buildOrderSync(session));
        }
    } catch (e) { console.error('🌅 [영업일 전환] 하차분 정리 실패 (전환은 계속):', (e as Error).message); }

    // 되돌리는 규칙은 shared 한 곳에만 있다 (세션 생성 때도 같은 규칙을 쓴다)
    session.activeFilter = resetToBaseFilter(session.baseFilter);

    /* 🥣 국면별 오늘값을 되돌리던 줄이 여기 있었다 (이식 C3-3b).
       값이 한 벌이 되어 **위의 `resetToBaseFilter` 한 번**이 그 일을 다 한다 —
       기사님: *"오늘 하루 동안 첫짐은 10km 로 고정되는 거지"* 는 그대로 참이다 */
    session.departedAt = null;   // 어제 출발한 것이 오늘 되살아나지 않는다

    console.log(`🌅 [영업일 전환] ${yesterday} → ${today} · 오늘 필터를 기본 설정으로 되돌립니다 ` +
        `(도착 ${session.baseFilter.destinationCity})`);
    logRoadmapEvent("서버", `[영업일 전환] ${yesterday} → ${today} — activeFilter 를 baseFilter 로 리셋`);

    // 파생 재계산 + 관제탑 전파
    updateActiveFilter(userId, {}, io);
    return true;
}
