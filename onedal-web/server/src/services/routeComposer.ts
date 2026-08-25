import type { MyOrder, PendingOrder } from "@onedal/shared";
import { isAlreadyLoaded, hasVisitedStop } from "@onedal/shared";
import { haversineKm } from "./geoService";
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
    sectionDriveMin?: Array<number | null>;
    /** 🧭 구간마다 어느 정거장인가 — `sectionDriveMin` 과 같은 길이. 자리가 아니라 이름으로 맞추는 열쇠 */
    sectionStops?: Array<{ orderId: string; stopType: 'pickup' | 'dropoff' }>;
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
    if (r.sectionDriveMin) holder.sectionDriveMin = r.sectionDriveMin;
    // 단독 경로의 정거장은 자명하다 — 이미 상차했으면 하차 하나뿐
    if (r.sectionDriveMin) {
        const own: Array<{ orderId: string; stopType: 'pickup' | 'dropoff' }> =
            hasVisitedStop(holder as any, 'pickup')
                ? [{ orderId: holder.id, stopType: 'dropoff' }]
                : [{ orderId: holder.id, stopType: 'pickup' }, { orderId: holder.id, stopType: 'dropoff' }];
        holder.sectionStops = own.length === r.sectionDriveMin.length ? own : undefined;
    }
    holder.routeComputedAt = new Date().toISOString();   // 타임라인 추정 약속의 닻

    holder.kakaoSoloDistanceKm = toKm(Math.max(0, r.distance - approachM));
    holder.kakaoSoloDurationMin = toMin(Math.max(0, r.duration - approachSec));

    // 접근 구간은 현위치를 알 때만 나온다. 모르면 값을 만들지 않는다 —
    // 관제탑이 "현위치 확인 안 됨"이라고 정직하게 말할 수 있어야 한다
    holder.approachDurationMin = approachSec > 0 ? toMin(approachSec) : undefined;
}

/**
 * ↩️ **경로를 바꾸기 직전 모습을 한 벌 떠 둔다** (기사님 확정 2026-08-23).
 *
 * 기사님: *"판정을 내리고 나서 내가 취소하면 이전 경로를 불러오는 거야?
 * 아님 새로 카카오로부터 다시 받아오는 거야?"* — 다시 받아오고 있었다.
 *
 * 새 콜을 붙일 때 경로가 덮이고, 그 콜을 취소하면 **원래 경로를 또 계산했다.**
 * 원래 콜은 아무것도 안 바뀌었는데. 덮기 전 모습을 들고 있다가 되돌리면 된다.
 *
 * 🔴 `applyRoute` 가 **경로를 쓰는 유일한 자리**이므로 스냅샷도 여기서만 뜬다 (규칙 ③).
 */
export interface RouteSnapshot {
    orderId: string;
    routePolyline?: RouteHolder['routePolyline'];
    totalDistanceKm?: number;
    totalDurationMin?: number;
    sectionEtas?: RouteHolder['sectionEtas'];
    sectionDriveMin?: RouteHolder['sectionDriveMin'];
    sectionStops?: RouteHolder['sectionStops'];
    routeComputedAt?: string;
    approachDurationMin?: number;
    /** 뜰 때의 현위치 — 되살릴 때 **여기서 움직였으면 쓰지 않는다** */
    at: { x: number; y: number } | null;
}

/**
 * 🗺️ **장부의 문자열을 좌표 배열로 되돌린다** — 저장 형식과 쓰는 형식의 경계.
 *
 * `routePolyline` 은 DB 에 JSON 문자열로 산다. 행을 그대로 내보내면 관제웹이
 * 배열인 줄 알고 `.filter()` 를 부르다 죽는다 (2026-08-23 실측 사고).
 * **되돌리는 자리는 여기 하나다** (규칙 ③) — 깨진 값은 `undefined`, 없는 것으로 친다.
 */
export function parsePolyline(raw: unknown): Array<{ x: number; y: number }> | undefined {
    if (Array.isArray(raw)) return raw.length ? raw : undefined;   // 이미 배열이면 그대로
    if (typeof raw !== 'string' || !raw) return undefined;
    try {
        const v = JSON.parse(raw);
        return Array.isArray(v) && v.length ? v : undefined;
    } catch {
        return undefined;
    }
}

/** 지금 모습을 그대로 뜬다 (덮어쓰기 직전에 부른다) */
export function snapshotRoute(holder: RouteHolder & { id: string }, at: { x: number; y: number } | null): RouteSnapshot {
    return {
        orderId: holder.id,
        routePolyline: holder.routePolyline,
        totalDistanceKm: holder.totalDistanceKm,
        totalDurationMin: holder.totalDurationMin,
        sectionEtas: holder.sectionEtas,
        sectionDriveMin: holder.sectionDriveMin,
        sectionStops: holder.sectionStops,
        routeComputedAt: holder.routeComputedAt,
        approachDurationMin: holder.approachDurationMin,
        at: at ? { x: at.x, y: at.y } : null,
    };
}

/**
 * 스냅샷을 되돌린다 — **현위치가 그대로일 때만.**
 *
 * ⚠️ 취소하는 사이 기사님이 움직였으면 같은 콜이라도 접근 구간이 달라진다.
 *    낡은 궤적을 쓰는 것은 없는 값을 쓰는 것보다 나쁘다 (규칙 ④).
 * @returns 되돌렸으면 true — false 면 호출자가 다시 계산해야 한다
 */
export function restoreRouteSnapshot(
    holder: RouteHolder,
    snap: RouteSnapshot | null | undefined,
    now: { x: number; y: number } | null,
): boolean {
    if (!snap || !snap.routePolyline?.length) return false;

    const moved = (snap.at?.x ?? null) !== (now?.x ?? null) || (snap.at?.y ?? null) !== (now?.y ?? null);
    if (moved) return false;

    holder.routePolyline = snap.routePolyline;
    holder.totalDistanceKm = snap.totalDistanceKm;
    holder.totalDurationMin = snap.totalDurationMin;
    holder.sectionEtas = snap.sectionEtas;
    holder.sectionDriveMin = snap.sectionDriveMin;
    holder.sectionStops = snap.sectionStops;
    holder.routeComputedAt = snap.routeComputedAt;
    holder.approachDurationMin = snap.approachDurationMin;
    return true;
}

/** 경로 연산 결과를 콜에 기록한다. 어떤 필드를 쓰는지도 여기서만 정한다. */
export function applyRoute(holder: RouteHolder, r: RouteResult): void {
    holder.routePolyline = r.polyline;
    holder.totalDistanceKm = toKm(r.distance);
    holder.totalDurationMin = toMin(r.duration);
    if (r.sectionEtas) holder.sectionEtas = r.sectionEtas;
    if (r.sectionDriveMin) holder.sectionDriveMin = r.sectionDriveMin;
    // 합짐 경로의 구간 주인은 composeMergedRoute 가 붙여 보낸다 — 길이가 어긋나면 안 싣는다
    if ((r as any).sectionStops) {
        holder.sectionStops = r.sectionDriveMin && (r as any).sectionStops.length === r.sectionDriveMin.length
            ? (r as any).sectionStops : undefined;
    }
    holder.routeComputedAt = new Date().toISOString();   // 타임라인 추정 약속의 닻
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
    /** 활성 콜. `calls[0]` 이 **첫짐 콜**(출발 기준)이고 그 뒤가 합짐1·합짐2… 다 */
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
 */
// 정의는 shared 로 옮겼다 (2026-08-19 — 관제웹 지도 폴백도 같은 판단을 쓴다). 재수출만 남긴다.
// ⚠️ **경로에 상차지를 넣을지는 이걸로 정하지 않는다** — `hasVisitedStop(c, 'pickup')` 이다.
//    2026-08-25 에 단독 경로 세 곳이 이걸 보고 있어서, 사이클 끝(콜 1건)마다 여주에서
//    성남 상차지로 50km 되돌아가는 경로가 나왔다.
export { isAlreadyLoaded, hasVisitedStop };

export async function composeMergedRoute(params: ComposeMergedRouteParams) {
    const { calls, extra, driverLocation, priority, carType } = params;

    const plan = planMergedStops(calls, extra, driverLocation);
    if (!plan) return null;

    const result = await calculateDetourRoute(
        plan.origin.dropoff.x, plan.origin.dropoff.y,
        plan.origin.pickup.x, plan.origin.pickup.y,
        plan.mergedDest.x, plan.mergedDest.y,
        plan.waypoints,
        driverLocation,
        priority,
        carType
    );
    /**
     * 🧭 구간의 주인 — `planArrivalStops` 는 같은 optimizeWaypoints 를 쓰므로
     * 카카오 요청의 경유 순서와 같다. 자리가 아니라 이름으로 맞추는 열쇠가 된다.
     *
     * 🔴 **`merged` 안에 붙인다** — 호출부는 전부 `applyRoute(holder, result.merged)` 라
     *    바깥에 붙이면 홀더에 영영 안 실린다. 실제로 그렇게 끊겨 있어서 #32 증상
     *    (도착마다 길이 어긋남 → 주행분 전부 null)이 4콜 모의주행에서 재발했다
     *    (2026-08-21 · tests/services/sectionStopsPlumbing.test.ts 가 이 이음새를 지킨다).
     */
    if (result?.merged) {
        (result.merged as any).sectionStops = planArrivalStops(
            extra ? [...calls, extra] : calls, driverLocation,
        ).map(st => ({ orderId: st.orderId, stopType: st.stopType }));
    }
    return result;
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
    const pairs: { pickup: Coord | null; dropoff: Coord | null }[] = [];
    let skippedPickups = 0;
    for (const c of calls) {
        const p = toCoordPair(c);
        if (!p) continue;
        /**
         * 🚏 **다녀온 정거장은 경유지에서 뺀다** — 판단은 `hasVisitedStop` 하나 (2026-08-19).
         *    예전엔 `isAlreadyLoaded`(상차 완료 버튼)만 봐서, **GPS 로 이미 다녀온
         *    상차지를 다시 가는 경로**가 나왔다 (실측: 없는 우회 20km).
         * 🔴 **하차지도 같은 규칙이다** (2026-08-21 · #36 — #32·#35 계보의 세 번째).
         *    하차 완료된 콜(사이클까지 활성)의 하차지를 계속 넣어, 다녀온 하차지를
         *    다시 가는 경로가 나왔고 planArrivalStops(둘 다 뺌)와 정거장 수가 갈라져
         *    주행중 합짐 KEEP 뒤 **주행분 전부 null** — 두 계획의 방문 규칙은 하나다.
         */
        const visitedPickup = hasVisitedStop(c, 'pickup');
        if (visitedPickup) skippedPickups++;
        pairs.push({
            pickup: visitedPickup ? null : p.pickup,
            dropoff: hasVisitedStop(c, 'dropoff') ? null : p.dropoff,
        });
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
    const allDropoffs = pairs.map(p => p.dropoff).filter(Boolean) as Coord[];
    if (allDropoffs.length === 0) return null;   // 갈 곳이 없다 — 사이클 끝 (경로를 지어내지 않는다)

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

    // 출발 기준은 **첫짐 콜**(calls[0]). 그 좌표가 없으면 첫 유효 좌표로 대체한다.
    // ⚠️ 상차지가 하나도 안 남았을 수 있으므로(전부 적재 완료) 하차지로도 폴백한다.
    /**
     * ⚖️ **비교 기준(base)도 다녀온 곳을 뺀다** (2026-08-19 실측).
     *
     * `origin.pickup` 은 우회 비용을 재는 base 경로의 경유지가 된다
     * (`현위치 → origin.pickup → origin.dropoff`). ①에서 merged 만 다녀온 상차지를
     * 뺐더니 **base 가 부풀어** 우회 비용이 음수로 나왔다 —
     * `추가 주행 +-13분 · 우회 거리 +-23.4km`. 합짐을 붙였는데 거리가 줄 리 없다.
     * 그 부푼 값과 비교하면 **모든 합짐이 과대평가**되고, 색이 곧 결정이므로(규칙 ⑤-3)
     * 색이 틀린다.
     *
     * 다녀온 상차지는 base 에서도 들르지 않는다 — 지금 남은 일은 하차뿐이다.
     * (`pickup === dropoff` 면 카카오 경유지가 목적지와 같아 사실상 직행이 된다)
     */
    const firstCall = calls.length > 0 ? calls[0] : null;
    const mainPair = firstCall ? toCoordPair(firstCall) : null;
    const origin = mainPair
        ? (hasVisitedStop(firstCall!, 'pickup')
            ? { pickup: mainPair.dropoff, dropoff: mainPair.dropoff }
            : mainPair)
        : { pickup: allPickups[0] ?? allDropoffs[0], dropoff: allDropoffs[0] };

    return { origin, mergedDest, waypoints, skippedPickups };
}

/** 도착 감지가 보는 정거장 — 어느 콜의 어느 쪽인지 라벨이 붙어 있다 */
export interface ArrivalStop {
    orderId: string;
    stopType: 'pickup' | 'dropoff';
    x: number;
    y: number;
}

/**
 * 도착 감지용 **정거장 목록** — 방문 순서대로, 라벨 포함.
 *
 * `planMergedStops` 와 같은 규칙으로 조립한다 (이미 상차한 콜의 상차지는 뺀다 ·
 * 상차지들 먼저, 하차지들 나중 · `optimizeWaypoints` 순서). 경유지 조립이 여기
 * `routeComposer` 한 곳뿐이어야 하는 규칙(loadedRoute 테스트)의 연장이다 —
 * 도착 감지가 자기 순서를 따로 만들면 "경로가 가리키는 다음"과 "감시하는 다음"이 갈라진다.
 *
 * `planMergedStops` 와 달리 **마지막 하차지도 포함**한다 (경유지가 아니라 정거장이므로).
 */
export function planArrivalStops(
    calls: RouteHolder[],
    driverLocation: Coord | null | undefined,
): ArrivalStop[] {
    const pickups: ArrivalStop[] = [];
    const dropoffs: ArrivalStop[] = [];
    for (const c of calls) {
        const p = toCoordPair(c);
        if (!p) continue;
        // 다녀온 곳은 "다음에 갈 정거장"이 아니다 — 도착 감지·경로·타임라인이 같은 목록을 본다
        if (!hasVisitedStop(c, 'pickup')) pickups.push({ orderId: c.id, stopType: 'pickup', ...p.pickup });
        if (!hasVisitedStop(c, 'dropoff')) dropoffs.push({ orderId: c.id, stopType: 'dropoff', ...p.dropoff });
    }
    if (pickups.length === 0 && dropoffs.length === 0) return [];

    const startLoc = driverLocation || pickups[0] || dropoffs[0];

    /**
     * 🔴 **상차를 전부 앞에 몰지 않는다 — 지나가는 길목부터 들른다** (기사님 실측 2026-08-25).
     *
     * 예전엔 `[...sortedPickups, ...sortedDropoffs]` 였다. 상차지를 전부 앞에 몰아 두는
     * 규칙인데, **새 콜이 붙으면 차를 그 상차지로 끌고 간다.**
     *
     * 실측 14:07:53 — 기사님 위치에서 **곤지암 하차 4.0km · 가남 29.9km** 인데 순서가
     *   ⑴ 가남상차 ⑵ 가남하차 ⑶ 세종대왕면하차 **⑷ 곤지암하차(94분)**
     * 로 나왔다. 4km 앞 하차지를 두고 **30km 동쪽으로 갔다가 되돌아오는** 경로다.
     * 게다가 하차 정렬의 기준점이 가남으로 옮겨져 곤지암이 더 밀렸다.
     *
     * ⚠️ **적재 때문에 상차가 먼저인 것이 아니다.** 하차는 이미 실은 짐을 내리는 것이라
     *    지나가는 길에 내리는 편이 싸다. 상차가 하차보다 먼저여야 하는 것은
     *    **같은 콜 안에서뿐**이다 (제 짐을 싣기 전에 내릴 수 없다).
     *
     * → 한 통에 넣고 가까운 순으로 돌되, 그 한 가지만 지킨다.
     */
    const pool: ArrivalStop[] = [...pickups, ...dropoffs];
    const out: ArrivalStop[] = [];
    let here: Coord = startLoc;
    const pickedUp = new Set(pickups.map(p => p.orderId));   // 아직 안 실은 콜

    while (pool.length > 0) {
        let bestIdx = -1, bestD = Infinity;
        for (let i = 0; i < pool.length; i++) {
            const st = pool[i];
            // 같은 콜의 상차를 아직 안 했으면 그 하차는 갈 수 없다
            if (st.stopType === 'dropoff' && pickedUp.has(st.orderId)) continue;
            const d = haversineKm(here.y, here.x, st.y, st.x);
            if (d < bestD) { bestD = d; bestIdx = i; }
        }
        // 갈 수 있는 곳이 없다 = 남은 것이 전부 «상차 안 한 콜의 하차» → 순서대로 붙인다
        if (bestIdx === -1) { out.push(...pool); break; }
        const best = pool.splice(bestIdx, 1)[0];
        if (best.stopType === 'pickup') pickedUp.delete(best.orderId);
        out.push(best);
        here = best;
    }
    return out;
}
