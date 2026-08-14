import type { MyOrder, PendingOrder } from "@onedal/shared";
import { calculateDetourRoute } from "./kakaoService";
import { optimizeWaypoints } from "../utils/routeOptimizer";

/**
 * 합짐 경로를 만드는 공통 규약.
 *
 * 예전에는 아래 4곳이 **똑같은 20여 줄을 각자 복사해** 가지고 있었다.
 *   handleDecision(KEEP) · recalculateActiveKakaoRoute(취소 후) ·
 *   recalculateKakaoRoute(재탐색) · restoreAndRecalculateSession(재시작 복구)
 *
 * 복사본이라 조금씩 어긋나 있었고, 그 어긋남이 그대로 버그가 됐다.
 *   - 결과를 기록하는 콜이 제각각 (securedOrder / activeSubs[last] / existingActive[last])
 *     → 재탐색해도 지도가 안 바뀌던 이슈 BB-③
 *   - 거리 단위가 제각각 (Math.round / 나눗셈 그대로 / toFixed)
 *     → 합짐 104.7km, 단독 105.0km 로 표기가 튀던 이슈 DD
 *   - TSP 시작점이 제각각 (driverLocation 유무)
 *   - 좌표가 없는 콜을 거르는 곳과 안 거르는 곳
 *
 * 이제 규약은 여기 한 곳뿐이다.
 *   ① 경로는 `composeMergedRoute()` 로만 만든다
 *   ② 결과는 `pickRouteHolder()` 가 고른 콜에 `applyRoute()` 로만 기록한다
 *   ③ 거리·시간 단위 변환은 `toKm()` / `toMin()` 으로만 한다
 */

export type RouteHolder = MyOrder | PendingOrder;
type Coord = { x: number; y: number };

/** 카카오는 미터를 준다. 관제탑 표기 자리수를 여기서만 정한다. */
export const toKm = (meters: number): number => parseFloat((meters / 1000).toFixed(1));

/** 카카오는 초를 준다. */
export const toMin = (seconds: number): number => Math.round(seconds / 60);

/** 카카오 응답 중 콜에 기록할 부분만 추린 모양 */
export interface RouteResult {
    polyline?: any;
    distance: number;      // meters
    duration: number;      // seconds
    sectionEtas?: any;
    /** 현위치 → 첫 상차지 소요 시간(초). 카카오가 주는데 예전에는 로그만 찍고 버렸다 */
    approachDuration?: number;
    /** 현위치 → 첫 상차지 거리(미터) */
    approachDistance?: number;
}

/**
 * 병합 궤적을 실을 콜을 고른다. **항상 "마지막 활성 콜"** 이다.
 *
 * 관제탑(PinnedRoute)도 `liveRoute`의 마지막에서 `totalDistanceKm`를 찾아 그리므로,
 * 기록처와 표시처가 같아야 화면이 갱신된다.
 */
export function pickRouteHolder<T extends RouteHolder>(activeCalls: T[], fallback: T): T {
    return activeCalls.length > 0 ? activeCalls[activeCalls.length - 1] : fallback;
}

/**
 * 단독 경로 결과를 기록한다. **접근 구간(현위치 → 상차지)을 분리해서** 남긴다.
 *
 * 🔴 카카오는 현위치를 origin 으로 주면 `summary.distance` 에 **접근 구간까지 포함한 총합**을 준다.
 *    그걸 그대로 `kakaoSoloDistanceKm`("해당 콜만의 단독 주행 거리")에 넣고 있었다.
 *    "단독"이라면서 상차지까지 가는 거리가 섞여 있던 셈이다.
 *    (실측 화면: `단독 74.1km` — 적요의 `상차지 → 하차지 53.3KM` 와 안 맞았다)
 *
 * 이제 셋을 구분한다.
 *   totalDistanceKm / totalDurationMin — 기사님이 실제로 달리는 전체 (접근 포함)
 *   kakaoSolo*                          — 상차지 → 하차지 구간만
 *   approachDurationMin                 — 현위치 → 상차지
 */
export function applySoloRoute(holder: RouteHolder, r: RouteResult): void {
    const approachSec = r.approachDuration ?? 0;
    const approachM = r.approachDistance ?? 0;

    holder.routePolyline = r.polyline;
    holder.totalDistanceKm = toKm(r.distance);
    holder.totalDurationMin = toMin(r.duration);
    if (r.sectionEtas) holder.sectionEtas = r.sectionEtas;

    holder.kakaoSoloDistanceKm = toKm(Math.max(0, r.distance - approachM));
    holder.kakaoSoloDurationMin = toMin(Math.max(0, r.duration - approachSec));

    // 접근 구간은 현위치를 알 때만 나온다. 모르면 값을 만들지 않는다 —
    // 관제탑이 "현위치 확인 안 됨"이라고 정직하게 말할 수 있어야 한다
    holder.approachDurationMin = approachSec > 0 ? toMin(approachSec) : undefined;
}

/** 경로 연산 결과를 콜에 기록한다. 어떤 필드를 쓰는지도 여기서만 정한다. */
export function applyRoute(holder: RouteHolder, r: RouteResult): void {
    holder.routePolyline = r.polyline;
    holder.totalDistanceKm = toKm(r.distance);
    holder.totalDurationMin = toMin(r.duration);
    if (r.sectionEtas) holder.sectionEtas = r.sectionEtas;
    // 통화 대본의 "여기서 N분 걸립니다" — 예전에는 계산해 놓고 로그만 찍고 버렸다
    if (r.approachDuration) holder.approachDurationMin = toMin(r.approachDuration);
}

/** 좌표가 상·하차 **둘 다** 있는 콜만 경유지로 쓴다 */
function toCoordPair(c: RouteHolder): { pickup: Coord; dropoff: Coord } | null {
    if (c.pickupX == null || c.pickupY == null || c.dropoffX == null || c.dropoffY == null) return null;
    return {
        pickup: { x: c.pickupX, y: c.pickupY },
        dropoff: { x: c.dropoffX, y: c.dropoffY },
    };
}

export interface ComposeMergedRouteParams {
    /** 활성 콜. `calls[0]`이 본콜(출발 기준)이다 */
    calls: RouteHolder[];
    /** 아직 `calls`에 들어가지 않은 후보 콜 (합짐 사전 평가용) */
    extra?: RouteHolder | null;
    driverLocation?: Coord | null;
    priority: string;
    carType: any;
}

/**
 * 활성 콜들로 TSP 경유지를 짜서 카카오 합짐 경로를 계산한다.
 * 좌표가 온전한 콜이 하나도 없으면 `null`을 준다 (호출부가 조용히 건너뛸 수 있게).
 */
/**
 * **짐을 이미 실었는가.**
 *
 * 🔴 이 판단은 **여기 한 곳에만 둔다.** 2026-08-13 에 합짐 경로에서만 고치고 단독 경로를
 *    빠뜨렸다가, 2026-08-14 에 같은 사고가 났다 — 합짐 하나를 내려 콜이 1건이 되는 순간
 *    단독 분기로 넘어가면서 **이미 다녀온 상차지가 경유지로 되살아났다.**
 *    (실측: 현위치 접근 44.5km · 총 137km · 폴리라인 1730 → 2294개)
 *
 * 기사님이 정리한 원칙 그대로다 — **KEEP 은 예약이고 상차가 적재다.**
 * 짐을 실었으면 그 콜에 남은 일은 **하차뿐**이다.
 */
export function isAlreadyLoaded(c: { status?: string | null }): boolean {
    return c.status === 'ORDER_PICKED_UP';
}

export async function composeMergedRoute(params: ComposeMergedRouteParams) {
    const { calls, extra, driverLocation, priority, carType } = params;

    const plan = planMergedStops(calls, extra, driverLocation);
    if (!plan) return null;

    return calculateDetourRoute(
        plan.origin.dropoff.x, plan.origin.dropoff.y,
        plan.origin.pickup.x, plan.origin.pickup.y,
        plan.mergedDest.x, plan.mergedDest.y,
        plan.waypoints,
        driverLocation,
        priority,
        carType
    );
}

/**
 * **정거장 계획 — 어디를 어떤 순서로 들르는가.** 카카오를 부르지 않는 **순수 함수**다.
 *
 * 🔴 떼어낸 이유: 2026-08-14 에 `OrderEvaluator` 가 이 조립을 **손으로 다시 하고 있었고**,
 *    그래서 이미 상차한 콜의 상차지를 경유지에 넣고 있었다. 고쳐 놓고도 **값으로 증명할
 *    방법이 없었다** — 카카오 호출 안에 묻혀 있었기 때문이다.
 *    떼어 두면 "실은 콜의 상차지가 경유지에 없다"를 테스트가 직접 확인한다.
 *    (`buildSoloRouteUrl` 을 뗀 것과 같은 이유)
 */
export function planMergedStops(
    calls: RouteHolder[],
    extra: RouteHolder | null | undefined,
    driverLocation: Coord | null | undefined,
): { origin: { pickup: Coord; dropoff: Coord }; mergedDest: Coord; waypoints: Coord[]; skippedPickups: number } | null {
    /**
     * 🔴 2026-08-13 — **이미 상차한 콜의 상차지는 경유지에서 뺀다.**
     *
     * 예전에는 활성 콜이면 무조건 상차·하차를 **둘 다** 경유지에 넣었다.
     * `ORDER_PICKED_UP`(짐을 이미 실은 콜)의 상차지까지 남아서,
     * **이미 다녀온 곳을 다시 가는 경로**가 나왔다. 거리와 시간이 부풀고,
     * 그 값으로 우회 예산을 재니 합짐 판정이 통째로 틀어진다.
     *
     * 기사님이 정리한 원칙과 같은 줄기다 — **KEEP 은 예약이고 상차가 적재다.**
     * 짐을 실었으면 그 콜에 남은 일은 **하차뿐**이다.
     */
    const pairs: { pickup: Coord | null; dropoff: Coord }[] = [];
    let skippedPickups = 0;
    for (const c of calls) {
        const p = toCoordPair(c);
        if (!p) continue;
        const alreadyLoaded = isAlreadyLoaded(c);
        if (alreadyLoaded) skippedPickups++;
        pairs.push({ pickup: alreadyLoaded ? null : p.pickup, dropoff: p.dropoff });
    }

    if (extra && !calls.some(c => c.id === extra.id)) {
        const extraPair = toCoordPair(extra);
        if (extraPair) pairs.push(extraPair);   // 후보 콜은 아직 안 실었으므로 상차지를 남긴다
    }
    if (pairs.length === 0) return null;
    if (skippedPickups > 0) {
        console.log(`🛣️ [경로] 이미 상차한 콜 ${skippedPickups}건의 상차지를 경유지에서 제외 (다녀온 곳을 다시 가지 않는다)`);
    }

    const allPickups = pairs.map(p => p.pickup).filter(Boolean) as Coord[];
    const allDropoffs = pairs.map(p => p.dropoff);

    // TSP 시작점: 기사님 현위치를 알면 거기서부터 최적화한다.
    // 예전에는 4곳 중 2곳만 driverLocation을 쓰고 나머지는 첫 상차지를 썼는데,
    // 같은 콜 조합인데도 어디서 호출했느냐에 따라 경유지 순서가 달라졌다.
    //
    // ⚠️ 짐을 다 싣고 하차만 남았으면 `allPickups` 가 **비어 있다**. 그때는 첫 하차지에서 시작한다.
    //    (GPS 가 없고 상차지도 없는데 `allPickups[0]` 을 쓰면 undefined 가 그대로 흘러간다)
    const startLoc = driverLocation || allPickups[0] || allDropoffs[0];
    const { sortedPickups, sortedDropoffs } = optimizeWaypoints(startLoc, allPickups, allDropoffs);

    const mergedDest = sortedDropoffs.pop()!;
    const waypoints = [...sortedPickups, ...sortedDropoffs];

    // 출발 기준은 본콜(calls[0]). 본콜 좌표가 없으면 첫 유효 좌표로 대체한다.
    // ⚠️ 상차지가 하나도 안 남았을 수 있으므로(전부 적재 완료) 하차지로도 폴백한다.
    const mainPair = calls.length > 0 ? toCoordPair(calls[0]) : null;
    const origin = mainPair ?? { pickup: allPickups[0] ?? allDropoffs[0], dropoff: allDropoffs[0] };

    return { origin, mergedDest, waypoints, skippedPickups };
}
