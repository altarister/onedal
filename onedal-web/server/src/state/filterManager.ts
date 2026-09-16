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
import { DEFAULT_DETOUR_RADIUS_KM, goalZonesOf, withNearness, pickupAreaKey, dropoffPartsOf, lastDropOf, lineUntil, lineFromPoint, mergeDropoffGroups, isDeliveredCall, getEligibleVehicleTypes, getRemainingCapacityTypesByPoints, deriveDispatchPhase, businessDayKey, resetToBaseFilter, rateFloorsFrom, TRUCK_CAPACITY_SLOTS, FILTER_FIELDS, filterValuesFrom, QUAD_FIELDS, quadShapeFrom, pruneExcludedRegions, netForGoal, cityCenter, nearestDong, autoRadii, heldRadiusDistanceKm, progressAlongKm, RADIUS_BASE_KM_DEFAULT,
         EVALUATING_STATUSES, effectiveRadii, pickupListNeedsRebuild } from "@onedal/shared";
import type { } from "@onedal/shared";

// ─────────────────────────────────────────────────────────────
// 🎛️ 필터 값
//
// **값 다섯의 유일한 원천은 user_filters 한 행이고, 컬럼·라벨의 원천은 FILTER_FIELDS 표다.**
// ─────────────────────────────────────────────────────────────

/**
 * 🏠 **집이 있는 시 — «좌표»로 뽑는다.**
 *
 * 🔴 주소 글자에서 「시」로 끝나는 조각을 찾지 않는다 — 사람이 적는 주소는 «광주시»라고 안 적는다
 *    («경기도 광주 초월 …»). 집 좌표(`home_x/home_y`)를 `nearestDong` 에 넣는다 —
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

/**
 * 🎯 **그물이 향하는 시 — «파생»이다** (규칙 ③).
 *
 * `callTarget` 이 HOME 이면 **집이 있는 시**, 아니면 기사님이 정한 `destinationCity`.
 * 🔴 **`destinationCity` 를 덮어쓰지 않는다** — 덮으면 복귀를 끄고 돌아올 때 원래 목적지가 없다.
 *    «어디를 볼지»만 여기서 매번 낸다. 목적지를 읽는 자리
 *    (첫짐 재계산·합짐 갱신·경유 조립·빈 차 경유·앱 피기백)가 **전부 이 함수**를 본다.
 * ⚠️ 집 주소에서 시·군을 못 뽑으면 `destinationCity` 로 물러선다 — 빈 그물을 만들지 않는다.
 */
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
 * 🏠 **살아 있는 목적지 전부** — 규칙은 shared `filterArea.goalZonesOf`, 세션에서 부르는 곳은 `goalZonesNow` 한 곳.
 *
 * ```
 * 복귀 끔                  [목적지]
 * 복귀 켬 · 복귀콜 없음    [목적지, 집]   그동안 관내콜을 진행한다
 * 복귀 켬 · 복귀콜 잡음    [집]           목적지 콜은 뜨면 안 된다
 * ```
 *
 * «복귀콜을 잡았나» = **복귀를 켠 뒤에 잡은** 콜 중 판이 집인 콜이 있나 (`homeCallsOf` · #131).
 *    취소·방출한 콜은 안 센다 — 복귀콜을 취소하면 복귀 대기로 돌아간다.
 *    ⚠️ `myOrders` 에는 하차한 콜이 영업일 끝까지 남는다 — 아침 복귀콜이 저녁 복귀를 «잡음»으로 못 만드는 것은 켠 시각이 막는다.
 */
export function goalCitiesOf(session: ReturnType<typeof getUserSession>, userId: string): string[] {
    /* `goalZonesOf`(목적지 콜이 남으면 목적지도)의 목적지 이름.
       콜의 판(`goalOfCall`) · 관제웹 `goalCities` 가 하차 · 상차 목록과 같은 답을 본다 (필터.md «필터 영역») */
    return goalZonesNow(session, userId, null).zones.map(z => z.city);
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
 * 📏 **자동 반경이 쓸 «잰 거리»를 들고 있게 한다 — 한 곳** (필터.md §10-1 ③ «하루에 한 번 잰다» · #149).
 *    들고 있으면 그대로, 비어 있으면 «내 위치 → 목적지»로 재서 싣는다(`radiusDistanceKm`).
 *    🔴 상차 목록(`rebuildPickupList`)과 하차 목록(`netKeywordsOf`)이 **반경을 쓰기 전에** 부른다 —
 *    한쪽만 재면 서버를 다시 켠 직후 먼저 만든 목록이 안 줄인 원래 반경으로 만들어진다.
 *    목적지 좌표를 모르면 재지 않는다 (규칙 ④).
 */
function holdRadiusDistance(session: ReturnType<typeof getUserSession>, city: string, me: { x: number; y: number } | null): number | undefined {
    let goal: { lng: number; lat: number } | null = null;
    try { goal = cityCenter(city); } catch { goal = null; }
    const measured = me && goal && Number.isFinite(goal.lng) && Number.isFinite(goal.lat)
        ? haversineKm(me.y, me.x, goal.lat, goal.lng) : null;
    const distanceKm = heldRadiusDistanceKm(session.activeFilter.radiusDistanceKm, measured);
    session.activeFilter.radiusDistanceKm = distanceKm;
    return distanceKm;
}

/**
 * 🕸️ **그물이 만든 하차지 목록** — 서버도 실험실과 **같은 계산**을 쓴다.
 *
 * 앱이 보는 `destinationKeywords` 는 **«이 콜의 하차지가 내 그물 안인가»** 하나를 답한다
 * (`InsungParser.kt` 의 `anyHit(pureDropoffText, …)`). 실험실의 `dropIn` 과 같은 질문이라
 * 그대로 맞물린다 (규칙 ⑤-4 ⑤).
 *
 * ```
 * 첫짐   line: null  · anchor: 내 위치       → 내 위치 원 ∪ 목적지 원 ∪ 마름모
 * 합짐   line: 지금 경로 · lastDrop: 라인 끝 → 라인 띠 ∪ 목적지 원 ∪ 마름모
 * ```
 *
 * 🔴 **못 그리면 도시 둘레로 물러선다** — 목적지를 모르거나(`cityCenter` 가
 *    좌표를 못 냄) 첫짐인데 내 위치를 모르면 그물의 꼭짓점이 없다. 그때 **비우지 않는다**:
 *    빈 목록은 «제한 없음»이 아니라 **고장**이고(루트 CLAUDE.md), 없는 값을 지어내지도
 *    않는다(규칙 ④). 잴 수 있는 방법으로 물러설 뿐이다.
 *
 * ⚠️ 그물은 동을 **중심점 하나**로 담는다 — 원 · 마름모 · 띠 가장자리에 걸친 동은 아래에서 따로 더한다.
 *    도시 둘레(폴리곤)와의 차이는 `pnpm net:compare` 로 잰다.
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
     * 📐 **반경 자동 맞춤** — 목적지와의 거리에 따라 반경이 자동으로 바뀐다 · 자동/수동 (필터.md §10-1).
     *
     * 🔴 **거리는 하루에 한 번 잰다** (필터.md §10-1 ③ · #117) — 들고 있으면 그것을 쓰고, 비어 있을 때만
     *    «내 위치 → 목적지»로 잰다(`holdRadiusDistance`). 합짐마다 «마지막 하차지 → 목적지»로 다시 재면
     *    목적지 앞에서 원이 거의 0 이 되어 관내콜도 가는 길의 좋은 콜도 못 받는다.
     *    비우는 곳: 다시 구하기(`null`) · 목적지 변경(`updateActiveFilter`) · 영업일 전환(`resetToBaseFilter`).
     * 🔴 **계산은 `shared` 한 곳이다** — 관제웹 지도(`StageView` «상차» · «하차» 레이어 · `effectiveRadii`)가 **같은 함수**를 부른다.
     *    두 벌이면 «지도는 든다는데 판정은 탈락»이 된다 (규칙 ③).
     * ⚠️ **수동이면 손대지 않는다.** 그리고 거리를 못 재면 자동도 **받은 값 그대로** 둔다
     *    (`autoRadii` 안에서 걸러진다 · 규칙 ④).
     */
    const distanceKm = holdRadiusDistance(session, city, me);
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
     * 📏 **자동이 지금 얼마로 줄였나** — 화면에는 배율이 아니라 **잰 거리**를 싣는다 (위 `holdRadiusDistance` 가 이미 실었다).
     *    셈은 `effectiveRadii` 한 곳이다.
     *    🔴 기사님이 정한 원값(`pickupRadiusKm` 등)은 **안 건드린다** (규칙 ④).
     */
    /**
     * 🎯 **목적지 가까이 옴 → 그 목적지 원에 걸친 동 전체** (필터.md «하차 영역»).
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
    /* 그물 입력 한 벌 — 중심점 그물(`netForGoal`)과 걸친 동(`regionsTouchingNetGrouped`)이 같은 입력을 본다 (규칙 ③) */
    const netOpts = {
        /* 🔷 **동선이면 경로를 안 본다** — 지도(`StageView` 의 `dropoffLine` · `pickupLine`)와 같은 분기다.
           서버가 이 값을 안 보면 «동선»을 골라도 판정·앱 목록은 노선이 된다 */
        line: session.activeFilter.routeMode === false ? null : line,
        lineRadiusKm: auto ? auto.detourRadiusKm : (session.activeFilter.detourRadiusKm ?? DEFAULT_DETOUR_RADIUS_KM),
        lastDrop,
        params,
        anchor: me ? { name: '내 위치', lng: me.x, lat: me.y } : { name: '내 위치', lng: goal.lng, lat: goal.lat },
        /* 🧩 **현위치 영역은 조각이 넣으라 할 때만** — 콜 없음 · 경로 생김(운행 전)이면 넣고 운행 뒤면 뺀다 (shared `dropoffPartsOf` · 필터.md «하차 영역») */
        me: part.withMe && me ? { name: '내 위치', lng: me.x, lat: me.y } : null,
    };
    const net = netForGoal(goal, netOpts);
    /* 🔴 그물이 아무것도 못 담으면 그것도 «고장»이다 — 물러선다 */
    if (!net.pass.length) return fallback();

    const grouped: Record<string, string[]> = {};
    for (const d of net.pass) {
        const region = d.region ?? '기타 지역';
        (grouped[region] ??= []).push(d.name);
    }
    /**
     * 🔵 **원 · 마름모 가장자리에 걸친 동도 넣는다** — 영역에 걸치면 들어간다 (필터.md «하차 영역»).
     *    그물은 동을 중심점 하나로 담아, 넓은 읍 · 면은 가장자리에 걸쳐도 빠진다. 판정은 그물과 같은 `netAreaTesterOf` · 걸침은 상차 목록과 같은 식.
     */
    const edge = regionsTouchingNetGrouped({ goal, ...netOpts });
    for (const [region, names] of Object.entries(edge)) (grouped[region] ??= []).push(...names);
    /**
     * 🧩 **경로 영역은 동 경계가 띠에 걸치면 넣는다.**
     *    그물은 동을 **중심점 하나**로 본다. 목업은 상차지 **좌표**로 재니 괜찮지만 원달앱은 **지역명만** 본다 —
     *    상차지가 띠 안인데 동 중심점이 띠 밖이면 목록에 없어 막힌다.
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
     * 📏 **진행도도 같은 그물에서 낸다** — 라인 띠로만 든 동에 붙은
     *    «라인 시작부터 몇 km 지점인가»(`callNet.buildLineNet`). 목록과 진행도가 **한 벌**이라야
     *    다른 계산의 진행도로 새 목록의 동을 지우지 않는다. 같은 이름이 둘이면 먼 쪽.
     */
    const progressKm: Record<string, number> = {};
    for (const d of net.pass) {
        if (d.progressKm == null) continue;
        const prev = progressKm[d.name];
        if (prev === undefined || d.progressKm > prev) progressKm[d.name] = d.progressKm;
    }
    /* 🧩 띠에 걸쳐 더한 동도 경로 위다 — 순서는 그 동의 경로 스냅점(순서 전용 값 · #78)으로 */
    /* 🔴 **그물이 이미 넣은 동에는 안 붙인다** — 목적지·마름모로 든 동은 «아직 안 간 곳»이라 진행도가 없다
          (`callNet.lineZoneOf` 의 `onlyByLine`). 붙이면 지나온 곳 빼기가 아직 안 간 동을 지운다 */
    /* 원 · 마름모로만 걸쳐 든 동도 «아직 안 간 곳»이다 — 띠에 걸친 동(`touch`)만 진행도를 받는다 */
    const bandNames = new Set(touch ? Object.values(touch.grouped).flat() : []);
    const inNet = new Set([...net.pass.map(d => d.name), ...Object.values(edge).flat().filter(n => !bandNames.has(n))]);
    if (touch) for (const [name, km] of Object.entries(touch.orderKm)) {
        if (inNet.has(name) || progressKm[name] !== undefined || !Number.isFinite(km)) continue;
        progressKm[name] = km;
    }
    return { ...prune(grouped, true), progressKm, destRingKm: Math.max(0, params.dstDiamKm / 2) };
}

/**
 * 🎯 **이 콜의 판 — 통과한 목적지** (목업 `judgeGoals` 의 `preferName`: 집).
 *    목적지가 하나면 그것. 복귀 대기(둘)면 하차지가 **목적지 원 안이면 목적지(관내콜)**, 그 밖이면서 **집 그물** 안이면 집, 아니면 목적지.
 *    🔴 목적지 원을 먼저 본다 — 집 그물은 꼭짓점이 «내 위치»인 마름모라 차 바로 옆 동이 꼭짓점 근처에 들어,
 *       관내콜이 «복귀콜 잡음»으로 적히고 그 뒤 관내콜이 막힌다. 원은 관내로 재는 그 원(`destRingKm`)이다 — 새 값 없음.
 *    ⚠️ 목적지 원이 집 쪽으로 걸치면 그 안의 집 방향 하차지도 관내콜로 적힌다 (원이 작아 손해가 작다).
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
 * 🎛️ **값 다섯은 평면 한 행(`user_filters`)에 산다** — 저장은 `saveBaseFilter`, 읽기는 이 함수 하나다.
 *    이름은 평면(앱 피기백) 것을 쓴다.
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
import { getCityRegionsWithRadius, pickupListFor, regionsTouchingCircleGrouped, regionsTouchingNetGrouped, cityAliases, getDetourRegions, unionRegions, getActivePolyline, trapsForKeywords, haversineKm, originOf } from "../services/geoService";

// ━━━ Prepared Statement 캐싱 (모듈 로드 시 1회만 실행) ━━━
// 노선·반경·할인율은 user_filters 의 평면 칸에 산다.
// min_fare·max_fare 는 보류 칸이다 (앱 피기백)
/**
 * 📐 마름모 셋도 같은 행에 산다.
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
    /* 🎯 화면·앱이 «지금 그물이 어디를 보나»를 알게 — 파생 · 읽기 전용 */
    session.activeFilter.goalCity = goalCityOf(session, userId) || undefined;
    /* 🏠 살아 있는 목적지 전부 — 지도가 목적지마다 그물을 그린다 */
    session.activeFilter.goalCities = goalCitiesOf(session, userId);
    /**
     * 차종별 하한 단가표는 **콜할인율에서만 파생된다** (docs/지금/필터.md §4).
     *
     * 관제웹은 `callDiscountPct` 하나만 보내고 표는 만들지 않는다 — 같은 표를 두 곳에서
     * 만들면 한쪽만 고쳐진다. 원천은
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
     * ⚠️ «무거우니 피한다»로 기능을 포기하지 않는다 — 부팅 때 `f.simplified`(200m) 캐시를 넣은 뒤로
     *    이 연산은 가볍다 (몇 초 걸린다는 옛 경고는 그 캐시 전 숫자다).
     */
    /**
     * 🔴 **조건에 빠진 입력이 있으면 «화면이 조용히 거짓말한다»** (규칙 ⑤-4 ④) —
     *    DB 에도 남고 화면도 바뀌는데 판정·앱이 쓰는 목록만 옛것이 된다.
     *    `netKeywordsOf` 가 읽는 입력을 새로 더하면 여기에도 더한다.
     */
    const needsGeoRecalc =
        'destinationCity' in changes ||
        'callTarget' in changes ||          // 🎯 타겟이 바뀌면 그물이 향하는 시가 바뀐다
        'routeMode' in changes ||           // 🛣️🔷 노선/동선이 바뀌면 그물의 모양이 바뀐다
        'destinationRadiusKm' in changes ||
        'excludedRegions' in changes ||     // 🚫 제외 지역
        /* 📐 **모드를 바꾸면 반경이 통째로 달라진다** — 그물을 다시 그려야 한다 */
        'radiusAuto' in changes ||
        'radiusBaseKm' in changes ||
        /* 📏 [↻ 다시 구하기] — 들고 있던 거리를 비웠으니 지금 위치로 다시 재고 그물을 다시 그린다 */
        'radiusDistanceKm' in changes ||
        /**
         * 🕸️ **그물의 재료 넷** — `netKeywordsOf` 가 실제로 읽는 입력이다. 빠지면 바꾸고 💾 해도
         *    `destinationKeywords` 가 옛값이라 «지도는 든다는데 앱은 안 잡는다».
         *    라인반경은 합짐 전용 `refreshDetourIfNeeded` 가 따로 건진다.
         */
        'pickupRadiusKm' in changes ||
        'srcAngleDeg' in changes ||
        'dstAngleDeg' in changes ||
        'quadRadiusKm' in changes ||
        (!session.activeFilter.destinationKeywords || session.activeFilter.destinationKeywords.length === 0);

    if (changes.destinationKeywords) {
        /**
         * 명시적으로 키워드가 전달된 경우 (합짐 경유 등) → 키워드는 그대로 쓴다.
         *
         * 🔴 **시 별칭(`customCityFilters`)이 같이 안 오면 반드시 다시 만든다.**
         *    `destinationKeywords` 만 넘기면 스프레드(`...changes`)가 별칭을 안 건드려
         *    **직전 목록의 별칭이 그대로 남는다.** 앱은 «시가 맞고 동도 맞아야 통과»로 판정하므로,
         *    엉뚱한 시 목록을 들고 있으면 멀쩡한 콜을 조용히 전부 걸러낸다.
         *
         * 별칭을 못 만들면 **비운다.** 옛 값을 남기느니 2단계 필터가 안 도는 편이 낫다
         * (동 이름만 본다). 있지도 않은 근거로 거르는 것이 더 나쁘다.
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
        /* 🎯 목적지는 «파생»이다 — HOME 이면 집 시 */
        const city = goalCityOf(session, userId);
        const radius = session.activeFilter.destinationRadiusKm || 0;
        console.log(`🗺️ [FilterManager] 지리 연산 트리거 (city=${city}, radius=${radius}km)`);
        /**
         * 🕸️ **그물이 목록을 만든다** — 화면이 그리는 그 계산이다. 살아 있는 목적지마다 (복귀 대기면 목적지 ∪ 집).
         *    제외 지역은 `netKeywordsOf` 안에서 `pruneExcludedRegions` 한 곳이 뺀다 (규칙 ③).
         */
        /**
         * 🧵 **콜을 쥐었으면 얼린 라인으로 만든다.** `null` 로 만들면 복귀를 켜거나 각도·반경을 바꿀 때
         *    다음 KEEP·하차까지 **경로 영역이 빠진 목록**이 폰에 간다 — 뒤따라 라인으로 다시 만드는 길이 없다.
         *    진행도도 함께 기억한다 — `rebuildNetFilter` 와 같은 모양 (지나온 곳 빼기가 이 목록을 본다)
         */
        const line = filterLineOf(session);
        /* 📋 **상차 목록을 먼저** — 목적지 · 반경 · 자동 반경이 바뀌면 상차 목록도 바뀐다. 안 만들면 0.5km 움직일 때까지 옛 목록이
              앱에 남고, 하차 목록도 옛 상차 목록을 뺀다 (#148) */
        rebuildPickupList(session, userId);
        const { flat, grouped, byNet, pruned, progressKm } = netOfGoals(session, userId,
            line ? line.map(p => [p.x, p.y] as [number, number]) : null);
        rememberDetourProgress(session, line ? progressOf(progressKm) : null);
        /* 🔴 별칭은 목록에 든 시 전부에서 — `netFilterOf` 와 같다. 걸친 동 · 가까이 온 목적지 원이 이웃 시 동을 더한다 */
        const aliases = new Set<string>();
        for (const parent of Object.keys(grouped)) for (const a of cityAliases(parent)) aliases.add(a);
        const customCityFilters = [...aliases];
        console.log(`🕸️ [FilterManager] ${byNet ? '그물' : '도시 둘레(물러섬)'} → 지역 ${flat.length}개`
            + (pruned > 0 ? ` (제외로 ${pruned}개 뺌)` : ''));
        session.activeFilter.destinationKeywords = flat;
        session.activeFilter.destinationGroups = grouped;
        /**
         * 🔴 첫짐에도 **시 별칭**을 실어 보낸다.
         *    비면 앱의 2단계 필터(`시 + 동` 교차 확인)가 `customCityFilters.isNotEmpty()` 조건에 걸려
         *    **아예 돌지 않고** 동 이름만 본다 — 수도권에는 같은 이름의 동이 많아 다른 시 콜이 그대로 통과한다.
         */
        session.activeFilter.customCityFilters = customCityFilters;
    } else if ('destinationCity' in changes && !changes.destinationCity) {
        /**
         * 🔴 **도시를 «지웠을 때»만 경유도 지운다** — «도시가 비어 있으면»으로 보지 않는다.
         *    경유는 **경로 기반**으로 꽂혀 도시를 안 본다(`syncDetourFilter`). «비어 있으면»으로 지우면
         *    도시와 무관한 변경(최저 운임·콜 잡기 껐다 켜기·GPS 파생 재계산)에도 경유가 통째로 날아가,
         *    앱이 아무 콜도 안 올리고 **조용히 멈춘다** (빈 필터는 «제한 없음»이 아니라 고장).
         *    GPS 이동은 이 함수를 안 거치고 전용 통로(`trimTraveled`)로 간다.
         */
        session.activeFilter.destinationKeywords = [];
        session.activeFilter.destinationGroups = {};
        session.activeFilter.customCityFilters = [];
    }
    // else: 도시/반경 변경 없음 → 기존 캐시된 destinationKeywords 유지 (이벤트 루프 보호)

    // 🔴 allowedVehicleTypes — 명시적으로 안 넘기면 **지금 실린 짐에서** 다시 구한다. 첫짐 목록(전 차종)으로 리셋하지 않는다.
    //    리셋하면 합짐 도중 경유가 갱신될 때마다(syncDetourFilter 는 키워드만 넘긴다)
    //    **적재 용량 제한이 조용히 풀려** 짐을 싣고도 큰 차 콜을 잡으러 간다.
    //    상태를 저장하지 말고 데이터에서 파생시킨다 (규칙 ③).
    if (!changes.allowedVehicleTypes) {
        const myVehicle = session.userVehicleType || '1t';
        const loaded = getActiveCalls(session);
        /**
         * 🚚 **기사님이 «받겠다»고 고른 것으로 한 번 더 좁힌다** — 1톤이어도 합짐을 위해 작은 짐만 받을 수 있다.
         *
         * 🔴 **두 질문을 갈라 둔다** (규칙 ⑤-4 ⑤):
         *      · `acceptedVehicleTypes` 는 **기사님이 정한다** — 짐이 오가도 안 바뀐다
         *      · `allowedVehicleTypes`  는 **서버가 파생한다** — 콜마다 다시 난다
         *    한 칸에 겹치면 경유가 갱신될 때마다 기사님이 좁혀 둔 것이 풀린다.
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
            // 통화·현장에서 실제 짐 양을 알면 그걸 쓴다 — 차종만 보면 크게 추정해
            // 그 차이만큼 합짐 기회를 놓친다. 재료는 단계 장부(`stepRecordsOf`)에서.
            const reports = new Map(loaded.map(c => [c.id, stepRecordsOf(c.id).reports]));
            const { points, confidence } = computeLoadedPoints(loaded, myVehicle, reports);
            session.activeFilter.allowedVehicleTypes = narrow(getRemainingCapacityTypesByPoints(myVehicle, points));
            session.capacityConfidence = confidence;
            session.activeFilter.capacityConfidence = confidence;

            /**
             * 관제탑 표시용 — 점수가 곧 **박스**다.
             * 🔴 칸 환산(나누기)을 넣지 않는다 — 박스가 곧 표시 단위다 (`pricingModel.test.ts`).
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
     * 🛣️ 경로 위 동 목록도 함께 기억한다.
     * ⚠️ **여기에는 경유만 넣는다.** 도착 목표에서 온 동을 섞으면 «경로 위»로 읽혀
     *    뒤로 돌아가 싣는 콜이 통과한다.
     */
    session.detourFlat = regions?.flat ?? null;
}

/**
 * 🧭 **앱에 내려보낼 경로 순서 맵** — 앱이 상차지의 경로 순서(역주행)를 볼 재료다.
 *
 * · 키를 **지금 목록(destinationKeywords)으로 좁힌다** — 세션의 순서 맵은
 *   지나온 동도 계속 들고 있어, 그대로 보내면 지나온 동이 "경로 위"로 남는다
 * · 경로 위가 아니거나 값을 모르면 **null** — "순서를 모른다"는 뜻이고 앱은 모르면 막지 않는다
 * · 경로가 없으면(첫짐) **빈 객체** — 앱이 순서 검사를 통째로 건너뛴다
 *
 * 🔴 **읽는 것은 `detourOrderKm`(순서 전용 · 순수 스냅점)이다** (#78).
 *    트림용 `detourProgressKm` 은 하차원 판정까지 부풀려 있어, 순서로 쓰면 길목의 동이
 *    경로 끝으로 밀려 앞길 콜이 «후진»으로 막힌다 (`routeOrderKm.test.ts`).
 */
export function buildAppOrderKm(
    session: ReturnType<typeof getUserSession>,
): Record<string, number | null> {
    /**
     * 🔴 진행 중 경로가 없으면(활성 콜 0) 순서도 없다 (#39).
     * 옛 사이클의 진행도 잔재를 내려보내면 앱 RouteOrderFilter 가 "경로 밖 상차지
     * 차단"을 **첫짐 탐색에** 발동한다 — 옛 경유 목록 밖 첫짐 후보가 전부 막힌다.
     * 원천(경로)이 없으면 파생도 빈 것이다 (규칙 ③).
     */
    if (getActiveCalls(session).length === 0) return {};
    const order = session.detourOrderKm;
    if (!order) return {};

    const out: Record<string, number | null> = {};
    for (const dong of session.activeFilter.destinationKeywords ?? []) {
        /* 🔴 **목록에 든 동은 다 싣는다. 경로 위가 아니면 `null`(순서 미상 → 통과).**
         *    필터는 그렇게 세밀할 수 없다 — 올리고, 판정에서 나쁜 점수를 받으면 기사님이 고르지 않는다 (규칙 ⑤).
         *    경로 밖 동을 빼서 «경로 밖 — 차단»으로 만들지 않는다 — 목적지 영역 안의 좋은 콜까지 막힌다.
         *    뒤로 가는 상차는 필터 영역이 뺀다(필터.md §5 «필터 영역»). */
        const v = order[dong];
        // 유한하지 않은 값이 섞여 들면 «순서 미상 — 통과» — 느슨한 쪽이 안전하다 (규칙 ⑤)
        out[dong] = Number.isFinite(v) ? (v as number) : null;
    }
    return out;
}

/**
 * **지나온 구간을 필터에서 뺀다** — 경유를 다시 그리지 않고.
 *
 * 까닭: 이미 지나온 곳으로는 뒤로 안 돌아간다 (기사님).
 *
 * 경유를 만들 때 동마다 기록해 둔 진행도(`detourProgressKm`)와 지금 GPS 의 진행도를
 * 비교하기만 한다 — 경유를 통째로 다시 계산하지 않는다.
 *
 * 안전 쪽으로 기운 규칙 셋. **일찍 빼면 잡을 수 있는 콜을 버린다:**
 *   ① 진행도를 **모르는 동은 남긴다**
 *   ② **전부 빠지면 아무것도 안 한다** — 빈 필터는 "제한 없음"이 아니라 **고장**이다
 *   ③ 동·시 묶음·별칭을 **한 벌로** 줄인다 (별칭이 남으면 앱의 2단계 필터가 어긋난다)
 */
export function applyTraveledTrim(session: ReturnType<typeof getUserSession>): boolean {
    /**
     * 🔴 **국면을 보지 않는다.** 지나온 구간은 **국면과 무관하게 참이다** — 이미 지난 동네는
     *    합짐이든 운행중이든 지난 동네다. 국면으로 거르면 도착 감지가 국면을 GATHERING 으로
     *    떨어뜨릴 때 **달리는 중인데 제거가 멈춘다.**
     *
     * 조건은 데이터에 맡긴다: 진행도가 있고(= 경유를 그렸고) · 경로가 있고 · GPS 가 있으면 돈다.
     * 콜이 0건이면 경로가 없으니 자연히 안 돈다.
     */
    const progress = session.detourProgressKm;
    if (!progress) return false;

    /* 🛣️ 얼린 라인 위 GPS 진행도 — 그물이 동마다 붙인 진행도와 **같은 셈**(`progressAlongKm`)이다 */
    const polyline = filterLineOf(session);
    /**
     * 🧭 **지금 위치로만 뺀다** — 묵었거나 집 주소로 대신한 위치면 안 뺀다.
     *    부팅 때 되살린 지난 위치로 빼면 새 경로의 앞길까지 «지나왔다»며 지운다.
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
     * 🚫 **제외 지역이 바뀌어도 다시 그린다.**
     *    반경만 보면 합짐 국면에서 «제외했는데 경로 주변 목록은 그대로»가 된다 —
     *    첫짐에선 빠지는데 합짐에선 들어오는, 국면마다 다른 말을 하는 모양이다.
     */
    const exBefore = JSON.stringify(before.excludedRegions ?? []);
    const exNow = JSON.stringify(session.activeFilter.excludedRegions ?? []);
    if (cRadius === before.detourRadiusKm && dRadius === before.destinationRadiusKm && exBefore === exNow) return;

    /**
     * 🕸️ **합짐도 그물 한 곳이 만든다** — 경로 버퍼(`recalculateDetourFilter`)를 부르지 않는다.
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
 * 🛣️ **필터가 쓰는 라인 — KEEP 순간 얼린 경로.**
 *
 * 경로가 다시 재져도(하차 완료·취소·재탐색) 필터 라인은 안 바뀐다 — 기사는 어찌 되었건 그 목적지로 간다 (기사님).
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
 * 🔵 **하차 목록 — 살아 있는 목적지마다 조각을 만들어 합친다** (`docs/지금/필터.md` «하차 영역»).
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
    /* 🔷 동선이면 라인이 없다 — 조각(`dropoffPartsOf`)과 그물(`netKeywordsOf`)이 같은 답을 보게 여기서 끊는다 */
    const lineXY = !line || session.activeFilter.routeMode === false ? null : line.map(([x, y]) => ({ x, y }));
    const radius = session.activeFilter.destinationRadiusKm || 0;
    const parts: Array<{ near: boolean; grouped: Record<string, string[]>; progressKm: Record<string, number> }> = [];
    /** 🔎 목적지마다 무엇으로 만들었나 — 로그 한 줄로 확인할 수 있게 (`rebuildNetFilter` 가 찍는다) */
    const details: string[] = [];
    const pickupGroups = session.activeFilter.pickupGroups ?? {};
    let byNet = zones.length > 0, pruned = 0;
    for (const z of zones) {
        const lastDrop = z.state === 'idle' || z.near ? null
            : lastDropOf({ isHome: z.isHome, homeOn, homeCity, stops, calls: activeCalls });
        /**
         * ✂️ **운행 뒤에는 라인을 현위치부터 쓴다** — 관제웹 지도(`StageView` 하차 띠)와 **같은 `lineFromPoint`**.
         *
         * 🔴 얼린 경로 그대로 쓰면 띠의 시작이 **콜을 잡던 자리**다. 띠 끝을 직각으로 잘라도(`lineZoneOf`)
         *    그 자름은 거기에 그어지므로, 지금 내 뒤에 있는 동이 여전히 «앞»으로 남는다 (#159).
         */
        const ridden = lineXY && z.state === 'driving' && origin
            ? lineFromPoint(lineXY.map(p => [p.x, p.y] as [number, number]), { lng: origin.x, lat: origin.y }).map(([x, y]) => ({ x, y }))
            : lineXY;
        const goalLine = ridden && lastDrop ? lineUntil(ridden, lastDrop) : [];
        const shape = dropoffPartsOf(z.state, goalLine.length >= 2, !!z.near);
        const kept = netKeywordsOf(session, userId, z.city, radius, {
            line: shape.line ? goalLine.map(p => [p.x, p.y] as [number, number]) : null,
            lastDrop: shape.quadFrom === 'lastDrop' ? lastDrop : null,
            withMe: shape.me,
            near: !!z.near,
        });
        parts.push({ near: !!z.near, grouped: kept.grouped, progressKm: kept.progressKm });
        const names = [...new Set(Object.values(kept.grouped).flat())];
        const pieces = z.near ? ['원(가까이 옴 · 안 뺌)']
            : [shape.me && '현위치', shape.line && '라인', shape.quadFrom === 'me' ? '마름모(현위치)' : shape.quadFrom === 'lastDrop' ? '마름모(종착지)' : '', '원'].filter(Boolean);
        details.push(`${z.city}:${z.state}${z.near ? '·가까이' : ''}${z.state !== 'idle' && !z.near && !lastDrop ? '·종착지 모름' : ''} `
            + `[${pieces.join('·')}] 걸친 ${names.length}곳${kept.byNet ? '' : ' (도시 둘레로 물러섬)'}`);
        byNet = byNet && kept.byNet;
        pruned += kept.pruned;
    }
    const merged = mergeDropoffGroups(parts, session.activeFilter.pickupGroups ?? {});
    return { flat: merged.flat, grouped: merged.grouped, byNet, pruned, progressKm: merged.progressKm, goals: zones.map(z => z.city), details };
}

/**
 * 🕸️ **필터 목록을 다시 만든다 — 한 곳.** 부팅 · 콜 0건 · KEEP · 경로 재계산 · 출발이 모두 그물(`netKeywordsOf`)을 부른다.
 * 🔴 때에 따라 다른 계산(시 경계 버퍼 · 경로 버퍼)으로 만들지 않는다 — 같은 콜이 때마다 통과했다 막혔다 한다.
 */
export function rebuildNetFilter(userId: string, io: any, pickupBuilt = false): void {
    const session = getUserSession(userId);
    const startedAt = Date.now();
    /* 📋 **상차 목록을 먼저** — 하차 목록이 먼 목적지에서 상차 목록 동을 뺀다 (`mergeDropoffGroups` · 필터.md «하차 영역»).
       경로 · 출발 · 복귀가 바뀌는 길이 여기로 모인다. 방송은 아래 `updateActiveFilter` 가 한 번에 한다.
       🔴 손으로 고친 필터여도 상차 목록은 만든다 — 하차 목록만 기사님 것이다 (#146 과 같은 모양) */
    const pickupChanged = pickupBuilt || rebuildPickupList(session, userId);
    /* 🔒 기사님이 손으로 고친 합짐 목록은 덮지 않는다 — 사이클이 끝나면 풀린다 */
    if (session.activeFilter.userOverrides && getActiveCalls(session).length > 0) {
        console.log(`🔒 [경유 고정] 기사님이 손으로 고친 필터라 자동 갱신을 건너뜁니다 ` +
            `(키워드 ${(session.activeFilter.destinationKeywords || []).length}개 유지)`);
        if (pickupChanged) broadcastFilter(userId, session, io);   // 상차 목록은 바뀌었다 — 그것은 알린다
        return;
    }
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
    /* 🔎 목적지마다 조각 · 뺀 수 — 지도 «하차» 레이어와 원달앱 목록이 맞는지 로그로 대조한다 (필터.md «하차 영역» · `pnpm log`) */
    console.log(`🔵 [하차 목록] ${kept.details.join(' | ') || '목적지 없음'} → 상차 목록 ${(session.activeFilter.pickupKeywords ?? []).length}곳 · 하차 ${kept.flat.length}곳 · ${Date.now() - startedAt}ms`);
}

/**
 * 🗺️ **키워드 트랩 — 한 곳.**
 *    "남동"→"인천 남동구" 같은 부분 문자열 오탐을 막는다. 원천은 전국 지명 사전(geoService)이고, 앱·서버 매칭(anyRegionHit)이 이 트랩으로 거른다.
 *    📋 **상차 목록 ∪ 하차 목록으로 한 벌** — 막는 낱말이 늘 뿐이라 통과를 넓히지 않는다 (필터.md «상차 목록»).
 *    🔴 목록을 바꾸는 두 길(`updateActiveFilter` · `rebuildPickupList`)이 **이 함수 하나**를 부른다 — 계산이 두 벌이면 한쪽 목록을 빠뜨린다.
 */
function refreshKeywordTraps(session: ReturnType<typeof getUserSession>): void {
    const f = session.activeFilter;
    f.keywordTraps = trapsForKeywords([...new Set([...(f.destinationKeywords ?? []), ...(f.pickupKeywords ?? [])])]);
}

/**
 * 🎯 **지금 살아 있는 목적지 · 각자 상태 · 가까이 옴 — 한 곳** (`docs/지금/필터.md` «필터 영역»).
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
 * 📋 **상차 목록을 만든다** (`docs/지금/필터.md` «상차 영역»).
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
    /* 📏 반경을 먼저 잰다 — 재시작 직후엔 «잰 거리»가 비어 있어, 안 재면 자동 반경이 원값으로 목록을 만든다 (#149). 하차 목록과 같은 첫 목적지 */
    const firstGoal = goalZonesNow(session, userId, null).zones[0]?.city;
    if (firstGoal) holdRadiusDistance(session, firstGoal, me);
    const eff = effectiveRadii(f);
    const line = f.routeMode === false ? null : filterLineOf(session);
    const { zones, homeOn, homeCity, homeCaught } = goalZonesNow(session, userId, me);
    const { list, grouped, shape } = pickupListFor({ me: { x: me.x, y: me.y }, radii: eff, line, zones });
    const prev = f.pickupKeywords;
    const prevArea = pickupAreaKey(f.pickupArea);
    session.pickupListAt = { x: me.x, y: me.y };
    f.pickupKeywords = list;
    f.pickupGroups = grouped;
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
        + `${shape === 'meLine' ? '내 위치 ∩ 라인(현위치부터)' : shape === 'me' ? '내 위치' : '없음'} · 내 위치 ${eff.pickupRadiusKm.toFixed(1)}km${me.isFallback ? '(집 주소로 대신)' : ''} → ${list.length}곳`);
    return changed;
}

/** 📋 GPS 가 0.5km 넘게 움직였으면 상차 목록을 다시 만들고 관제웹에 알린다 (`PICKUP_LIST_MOVE_KM`) */
export function maybeRebuildPickupList(userId: string, io?: any): void {
    const session = getUserSession(userId);
    const me = originOf(session as Parameters<typeof originOf>[0]);
    if (!pickupListNeedsRebuild(session.pickupListAt, me ? { x: me.x, y: me.y } : null)) return;
    /* 🔵 상차 목록 · 지도 재료 · 가까이 옴이 바뀌면 **하차 목록도** — 먼 목적지는 상차 목록 동을 빼기 때문이다 (필터.md «하차 영역») */
    if (rebuildPickupList(session, userId)) rebuildNetFilter(userId, io, true);
}

/**
 * 🎛️ **값 다섯은 국면마다 따로 두지 않는다 — 평면 통로 하나로 간다.**
 *    오늘만이면 `updateActiveFilter`, 앞으로 계속이면 `saveBaseFilter`. 마름모·제외지역도 같은 길이다.
 *    단가표는 국면 전환이 아니라 **할인율이 바뀔 때** `updateActiveFilter` 가 다시 만든다.
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
             * 🎯 **지금 도착 목표를 경유에 합친다** — 경유만 쓰면 «목적지 안인데 경로에서 벗어난 곳»이 통째로 막힌다.
             *    저장하지 않고 **지금 쓰는 필터 값**에서 파생한다 (규칙 ③).
             *
             * 🔴 **파생은 바로 윗단(activeFilter · `goalCityOf`)만 본다.** 그 윗단의 원천을 직접 읽으면
             *    복귀 같은 변환이 통째로 무시되어, 화면은 새 목적지를 말하는데 판정만 옛 목적지를 본다.
             * 🔴 **조립은 여기 한 곳뿐이다** — 두 곳이 조립하면 한쪽이 다른 쪽을 덮어쓴다 (#31).
             */
            const merged = unionRegions(
                detour,
                goalCityOf(session, userId),   // 🎯 파생 목적지
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
                 *    그 동에서 싣는 콜을 허용한다 (뒤로 돌아가 싣는 콜이 통과한다).
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
    // 부트스트랩 중에는 중간 상태를 내보내지 않는다.
    // 복구 과정에서 updateActiveFilter 가 여러 번(상태 파생 → 경유 재계산) 호출되는데,
    // 그때마다 filter-updated 를 쏘면 관제탑이 첫짐 → 합짐으로 깜빡인다.
    // 확정된 필터는 부트스트랩 끝에서 filter-init 으로 한 번만 나간다.
    if (session.isBootstrapping) return;
    if (!io) return;

    const payload = {
        activeFilter: session.activeFilter,
        baseFilter: session.baseFilter,
    };

    /**
     * 🔴 **바뀐 게 없으면 안 보낸다.**
     *
     * 이 함수는 `updateActiveFilter` 끝에서 불리고 호출부가 많다. 한 동작(KEEP 하나)이
     * 내부적으로 여러 단계를 거치면 그 수만큼 나가, 관제웹이 중간 상태를 다 받아 그때마다 다시 그린다.
     * 위 `isBootstrapping` 방어와 같은 까닭을 부트스트랩 밖까지 민 것이다.
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
            /* 🎛️ 값 다섯 — **같은 행에** 쓴다 */
            ...(() => { const v = filterValuesFrom(b as any); return FILTER_FIELDS.map(f => v[f.path]); })(),
            /**
             * 📐🚚 **`db.ts` 에 칸을 새로 만들면 여기 줄도 더한다.**
             *    🔴 빠지면 💾 를 눌러도 안 남아, 자정에 그 값(자동 모드 · 받을 짐 등)이 조용히 풀린다.
             */
            b.radiusAuto ? 1 : 0,
            Number.isFinite(b.radiusBaseKm as number) ? b.radiusBaseKm : null,
            JSON.stringify(b.acceptedVehicleTypes || []),
            b.routeMode === false ? 0 : 1,   // 🛣️🔷 기본은 노선
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
         * 🔴 되돌리는 것은 **합짐 사이클이 만든 파생값**뿐이다 — `{...session.baseFilter}` 로 통째로 덮지 않는다.
         *    통째로 덮으면 콜 하나 끝날 때마다 기사님이 오늘 정한 콜 필터
         *    (목적지 도시·최저 운임·상차 반경·블랙리스트)가 사라진다.
         *    오늘 필터(baseFilter → activeFilter) 는 **영업일이 바뀔 때** 되돌아간다.
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
         * 🔴 **반경 · 제외 지역이 바뀌면 지역 목록도 다시 그린다** (`refreshDetourIfNeeded` · `phaseUi.test.ts` 가 문다).
         *    안 그리면 «하차 0km» 라고 적힌 채 **옛 목록으로 거른다** — 화면과 판정이
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
         * 📏 **기사님이 목적지를 바꾸면 자동 반경 거리를 비운다** (필터.md §10-1 ③) — 다른 목적지의 거리를 쓰지 않는다.
         * 🔴 **값이 실제로 바뀔 때만** — 필터 화면의 저장은 목적지를 늘 같이 보낸다. 그걸로 비우면 달리는 중에 다시 재진다.
         * ⚠️ 복귀로 «그물이 보는 목적지»가 집이 되는 것(`callTarget`)은 여기를 안 지난다 — 기사님 결정으로 그대로 둔다.
         */
        if ('destinationCity' in changes && changes.destinationCity !== prevDestinationCity && !('radiusDistanceKm' in changes)) session.activeFilter.radiusDistanceKm = undefined;
        /**
         * 📏 **[↻ 다시 구하기] 는 값이 같아도 한 번 내보낸다** (버그 대장 #158).
         *    같은 자리에서 다시 재면 **같은 거리**가 나온다 — 집 주소로 대신 재는 책상에서는 늘 그렇다.
         *    그러면 아래 방송이 «바뀐 게 없다»(`lastFilterJson`)로 걸러져, 누를 때 비운 값이 화면에
         *    되돌아오지 못한다. 눌렀다는 것 자체가 «다시 실어 보내라»는 뜻이므로 여기서 한 번 푼다.
         */
        if ('radiusDistanceKm' in changes) session.lastFilterJson = null;
        // 파생 데이터 재계산
        recalculateDerivedFields(session, changes, userId);
        refreshDetourIfNeeded(session, userId, before);
    }

    refreshKeywordTraps(session);

    // 🔴 isSharedMode · dispatchPhase 는 **데이터에서 파생**된다 — 지금 실린 콜 수가 진실이다.
    //    (STANDBY = 첫짐 = 단독,  GATHERING/DELIVERING = 합짐)
    //    여기 단일 진입점에서 불변식으로 강제한다. 저장 상태로 두고 경로마다 바꾸게 하면
    //    한 경로(예: 완료)가 빠질 때 콜을 다 끝내도 «합짐 탐색중»이 남고, 재시작 때 둘이 어긋난다.
    //    전이(advanceOnKeep / rollbackOnCancel)와 결과는 같다.
    //
    // isSharedMode 필드를 없애지 않는 이유: 앱의 InsungParser 가 이 키를 파싱한다 (페이로드 계약).
    const activeCount = getActiveCalls(session).length;

    /**
     * 실은 짐이 없으면 **'운행 중'도 '하차 중'도 될 수 없다.**
     *
     * 🔴 `DRIVING` 만이 아니라 도착 감지가 켠 `UNLOADING` 도 되돌린다 — 남기면 **빈 차인데 화면은 "하차 중"** 이라 말한다.
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
     * 🔴 **선점 중인 콜이 없으면 콜 잡기는 켜져 있어야 한다.**
     *
     * `isActive` 는 "지금 콜을 물어도 되는가" 다. `/orders/confirm` 이 콜을 선점하면서
     * `false` 로 끄고(결재 날 때까지 다른 콜을 안 물게), **결재가 나면** `rollbackOnCancel`
     * 이 다시 켠다. 결재를 거치지 않는 취소 경로(화면 이탈 강제 취소 · `/detail` 타임아웃 ·
     * 비상 보고)는 끄기만 한다 — 안 켜면 화면에 아무 표시 없이 **콜 잡기가 죽은 채로 남는다.**
     *
     * 켜는 책임을 취소 경로마다 흩지 않는다 — **선점 중인 콜이 없다**는 데이터에서 파생시킨다.
     * 관제웹은 이 값을 보내지 않으므로(기사님이 손으로 끄는 스위치가 아니다) 안전하다.
     *
     * ⚠️ `pendingOrdersData.size` 로 세면 안 된다 — 그 캐시에는 **종료된 콜도 남아 있다**
     *    (`buildOrderSync` 가 거기서 terminated 를 뽑는다).
     *
     * 🔴 **«끝나지 않은 콜»로 세도 안 된다** (#80). KEEP 된 콜은 캐시에
     *    **일부러 남는데**(dispatchEngine 승격 덮어쓰기 — 롤백 방지) 끝난 콜이 아니라서,
     *    그렇게 세면 콜을 하나라도 보유한 순간부터 이 불변식이 안 돌아 콜 잡기가 영영 잠긴다.
     *    세어야 할 것은 **심사 중**(선점~결재 사이 · `EVALUATING_STATUSES`)뿐이다 —
     *    확정 콜은 끝나지도 않았지만 선점 중도 아니다.
     *
     * 🔴 **이 불변식은 «선점 잠금»만 푼다.** 기사님이 기기를 「대기」로 두어 끈 것까지 되켜지 않는다 —
     *    `filterEnabledByMode` 가 «기사님 의도» 이고, 이 불변식은 그것을 **넘지 않는다**.
     *    (`undefined` 는 «켬» — 모드를 한 번도 안 고른 사용자)
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
     * 🔴 매출은 **하차한 날**의 것이다 (#38).
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

/**
 * **영업일이 바뀌었으면 오늘 필터를 기본 설정으로 되돌린다.**
 *
 * 기본 설정은 사용자 설정에 두고, 날이 바뀌면 그것을 가져온다. 기사님은 운행 전 오늘 콜이 많이 나올 곳으로
 * 필터를 바꾸고, 안 바꾸면 기본 설정 그대로 콜을 잡는다.
 *
 * 경계는 **자정**이다.
 * `isActive` 는 끄지 않는다 — 아침에는 기본 설정 그대로 콜 잡기를 시작한다.
 *
 * ⚠️ 타이머를 두지 않는다. 접속·스크랩처럼 **세션을 건드리는 순간**에 확인한다.
 *    타이머는 서버가 자는 사이를 못 잡고, 프로세스가 죽으면 사라진다.
 *
 * @returns 되돌렸으면 true
 */
export function ensureBusinessDay(userId: string, io?: any): boolean {
    const session = getUserSession(userId);
    const today = businessDayKey(Date.now());
    if (session.businessDay === today) return false;

    const yesterday = session.businessDay;
    session.businessDay = today;

    /**
     * 📊 **성과 기록 — 어제치를 리셋 전에 집계한다** (필터 정의 4장).
     * "이 설정이 얼마를 벌었나" — 설정 스냅샷은 **리셋되기 전의 어제 오늘값**이어야
     * 하므로 아래 되돌리기보다 먼저 찍는다. 실패해도 전환은 계속 (계측이지 흐름이 아니다).
     */
    try { recordDayResult(userId, yesterday, session.activeFilter); }
    catch (e) { console.error('📊 [성과 기록] 실패:', (e as Error).message); }

    /**
     * 🖥️ **어제 하차분을 화면 사이클에서 정리한다** (#37).
     *
     * `deckOfCycle` 은 *"진행 중이 남으면 하차한 콜도 같이 보여준다"* — 6단계 채워진 모습을
     * 보기 위한 화면 규칙이다. 사이클이 자정을 걸치면(미하차 콜을 남기고 잠들면) 어제 하차한
     * 콜이 오늘 "진행 중"으로 보인다. 재부팅 복구는 영업일로 거르고, 살아 있는 세션은 여기서 뺀다.
     *
     * 하차한 날의 원천은 장부(orders.completedAt)다 — 오늘이 아니면 화면 재료
     * (메모리)에서만 뺀다. 미하차 콜·장부·매출은 건드리지 않는다 (규칙 ① ·
     * "상태는 콜별 즉시, 화면은 하루 단위" · 사이클 = 하루 — 자정 경계가 관제웹 `deckOfCycle` 과 같다).
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

    /* 값은 한 벌이라 위의 `resetToBaseFilter` 한 번이 오늘값을 다 되돌린다 */
    session.departedAt = null;   // 어제 출발한 것이 오늘 되살아나지 않는다

    console.log(`🌅 [영업일 전환] ${yesterday} → ${today} · 오늘 필터를 기본 설정으로 되돌립니다 ` +
        `(도착 ${session.baseFilter.destinationCity})`);
    logRoadmapEvent("서버", `[영업일 전환] ${yesterday} → ${today} — activeFilter 를 baseFilter 로 리셋`);

    // 파생 재계산 + 관제탑 전파
    updateActiveFilter(userId, {}, io);
    return true;
}
