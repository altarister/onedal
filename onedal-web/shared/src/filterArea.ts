/**
 * 🧩 **필터 영역 — 살아 있는 목적지마다 상태 셋** (기사님 확정 2026-09-15 · `docs/지금/필터.md` «필터 영역» · «상차 영역» · «하차 영역»).
 *
 * «목적지»는 기사님이 정한 곳이다 — 파주든 집이든 목적지다. 목적지마다 그 목적지 콜을 보고 상태 하나를 낸다.
 *
 * | 상태 | 뜻 | 필터 영역 | 상차 영역 |
 * |---|---|---|---|
 * | `idle`    | 그 목적지 콜 없음        | A ∪ Q(현위치→목적지) ∪ 목적지 영역 | A |
 * | `routed`  | 콜을 잡아 경로가 생김 (운행 전) | A ∪ 라인 ∪ Q(종착지→목적지) ∪ 목적지 영역 | A |
 * | `driving` | 운행 시작 뒤             | (A ∩ 라인) ∪ 라인 ∪ Q(종착지→목적지) ∪ 목적지 영역 | A ∩ 라인 |
 *
 * 🏘️ **관내는 따로 없다** — 목적지에서 콜을 다 내리면 그 목적지는 그냥 `idle` 이다
 *    (기사님 2026-09-15 *"그쪽에 도착했으니 다른 곳을 정하지 않았으면 그곳에서 일 있으면 하자"*).
 *
 * 🔴 **읽는 곳** — 관제웹 «상차» · «하차» 레이어(`StageView`)와 서버 상차 · 하차 목록(`filterManager.goalZonesNow` → `rebuildPickupList` · `netOfGoals`)이
 *    **같은 함수**를 부른다 ([todo.md](../../../todo.md) «필터 영역 개정»).
 */

import { cityCenter, quadOutline, haversineKm, type NetParams } from './callNet';

export type GoalState = 'idle' | 'routed' | 'driving';

export interface GoalZone {
    city: string;
    /** 집(복귀 목적지)인가 */
    isHome: boolean;
    state: GoalState;
    /** 🎯 목적지 가까이 옴 — `withNearness` 가 채운다. 없으면 «멀다»로 본다 */
    near?: boolean;
}

/**
 * 살아 있는 목적지와 각자의 상태.
 *
 * - 목적지는 **복귀 끔 · 복귀콜을 아직 못 잡음 · 목적지 콜이 남아 있음** 중 하나면 산다
 * - 집은 **복귀 켬**이면 산다 — 집을 모르면 없다 (지어내지 않는다 · 규칙 ④)
 * - 콜의 주인: 복귀 켬이고 판(`goalCity`)이 집이면 집 콜 · 나머지는 목적지 콜
 *
 * @param homeCaught 복귀를 켠 뒤 복귀콜을 잡은 적 있나 — 서버 `homeCallsOf` (하차한 콜도 센다)
 * @param activeCalls 지금 실린(진행 중인) 콜만
 */
export function goalZonesOf(o: {
    destinationCity: string | null | undefined;
    homeCity: string | null | undefined;
    homeOn: boolean;
    homeCaught: boolean;
    departed: boolean;
    activeCalls: ReadonlyArray<{ goalCity?: string | null }>;
}): GoalZone[] {
    const homeAlive = o.homeOn && !!o.homeCity;
    const homeCalls = o.activeCalls.filter(c => isHomeCallOf(c, o)).length;
    const destCalls = o.activeCalls.length - homeCalls;
    const stateOf = (calls: number): GoalState => calls === 0 ? 'idle' : o.departed ? 'driving' : 'routed';

    const zones: GoalZone[] = [];
    if (o.destinationCity && (!homeAlive || !o.homeCaught || destCalls > 0)) {
        zones.push({ city: o.destinationCity, isHome: false, state: stateOf(destCalls) });
    }
    if (homeAlive) zones.push({ city: o.homeCity as string, isHome: true, state: stateOf(homeCalls) });
    return zones;
}

/**
 * 🟢 **상차 도형** — 필터 영역 중 현위치 영역이 들어간 항만 상차 자리다
 *    (기사님 *"아무리 빨리 가도 마름모 영역까지 상차를 20분 안에 할 수 없잖아"*).
 *
 * 목적지마다 상차는 `idle`·`routed` 면 A, `driving` 이면 A ∩ 라인 — 합치면
 * **하나라도 `driving` 이 아니면 A 전체**, 전부 `driving` 이면 A ∩ 라인이다.
 * 목적지가 없으면 `null` — 그릴 것이 없다.
 */
export function pickupShapeOf(zones: ReadonlyArray<GoalZone>): 'me' | 'meLine' | null {
    if (zones.length === 0) return null;
    return zones.every(z => z.state === 'driving' && !z.near) ? 'meLine' : 'me';
}

/**
 * 🎯 **목적지 가까이 옴** (기사님 확정 2026-09-15 · `docs/지금/필터.md` «필터 영역»).
 *
 * **Q(현위치→목적지) 마름모가 현위치 원 ∪ 목적지 원 안에 통째로 들어가면** 가까이 옴 — 상차 A 전체 · 하차 그 목적지 원 전체.
 * 기사님: *"마름모가 두 영역 사이에 들어가면 상차지는 현위치영역전체 하차지는 목적지전체"* · *"맞아"*.
 * 🔴 판단 마름모는 목적지 상태와 상관없이 늘 **현위치 → 목적지**다 — «종착지 → 목적지»로 보면 종착지만 목적지 근처여도 차는 먼데 가까이 옴이 된다.
 * 테두리 점(`quadOutline` · 2° 광선)이 전부 두 원 중 하나 안에 드는가로 잰다. 반지름은 `srcDiamKm / 2` · `dstDiamKm / 2`.
 */
export function isNearGoal(o: { me: { x: number; y: number }; goal: { lng: number; lat: number }; params: NetParams }): boolean {
    const me = { name: '내 위치', lng: o.me.x, lat: o.me.y };
    const goal = { name: '목적지', lng: o.goal.lng, lat: o.goal.lat };
    const rMe = Math.max(0, o.params.srcDiamKm / 2), rGoal = Math.max(0, o.params.dstDiamKm / 2);
    return quadOutline(o.params, me, goal).every(p => haversineKm(me, p) <= rMe || haversineKm(goal, p) <= rGoal);
}

/** 🎯 목적지마다 «가까이 옴»을 채운다 — 지도에 없는 시(좌표를 모름)는 «멀다»로 둔다 (지어내지 않는다 · 규칙 ④) */
export function withNearness(zones: ReadonlyArray<GoalZone>, o: { me: { x: number; y: number }; params: NetParams }): GoalZone[] {
    return zones.map(z => {
        let goal: { lng: number; lat: number };
        try { goal = cityCenter(z.city); } catch { return { ...z, near: false }; }
        if (!Number.isFinite(goal.lng) || !Number.isFinite(goal.lat)) return { ...z, near: false };
        return { ...z, near: isNearGoal({ me: o.me, goal, params: o.params }) };
    });
}

/** 🏠 **이 콜이 집 콜인가** — 복귀 켬이고 판(`goalCity`)이 집이면 집 콜 · 나머지는 목적지 콜. 콜의 주인은 여기 한 곳이 가른다 */
export function isHomeCallOf(call: { goalCity?: string | null }, o: { homeOn: boolean; homeCity: string | null | undefined }): boolean {
    return o.homeOn && !!o.homeCity && call.goalCity === o.homeCity;
}

/**
 * 🔵 **하차 영역 — 목적지 하나에 넣는 조각** (목적지 원은 늘 넣는다).
 *
 * | 상태 | 하차 영역 |
 * |---|---|
 * | `idle`    | 현위치 원 ∪ Q(현위치→목적지) ∪ 목적지 원 |
 * | `routed`  | 현위치 원 ∪ 라인 ∪ Q(종착지→목적지) ∪ 목적지 원 |
 * | `driving` | 라인 ∪ Q(종착지→목적지) ∪ 목적지 원 — (A ∩ 라인)은 라인 안이라 현위치 원을 따로 안 넣는다 |
 *
 * @param hasLine 그 목적지의 라인이 있나 — 🔷 동선이거나 경로를 모르면 없다. 그때는 «콜 없음» 모양으로 본다 (라인을 지어내지 않는다 · 규칙 ④)
 */
export function dropoffPartsOf(state: GoalState, hasLine: boolean, near = false): { me: boolean; line: boolean; quadFrom: 'me' | 'lastDrop' | null } {
    /* 🎯 가까이 온 목적지는 목적지 원 전체뿐 — 상차 목록 동도 빼지 않는다 (필터.md «하차 영역») */
    if (near) return { me: false, line: false, quadFrom: null };
    if (state === 'idle' || !hasLine) return { me: true, line: false, quadFrom: 'me' };
    return state === 'routed'
        ? { me: true, line: true, quadFrom: 'lastDrop' }
        : { me: false, line: true, quadFrom: 'lastDrop' };
}

/**
 * 🏁 **목적지마다 경로의 종착지** — 경로 순서(`routeStops`)에서 그 목적지 콜의 **마지막 하차지**.
 *    목적지가 집이어도 같다 (기사님 확정 2026-09-15 «목적지가 집일 때도 똑같이»).
 * 그 목적지 하차 정거장이 없거나 좌표를 모르면 `null` — 앞 정거장으로 대신하지 않는다 (규칙 ④).
 */
export function lastDropOf(o: {
    isHome: boolean;
    homeOn: boolean;
    homeCity: string | null | undefined;
    stops: ReadonlyArray<{ orderId: string; stopType: 'pickup' | 'dropoff' }>;
    calls: ReadonlyArray<{ id: string; goalCity?: string | null; dropoffX?: number; dropoffY?: number }>;
}): { x: number; y: number } | null {
    for (let i = o.stops.length - 1; i >= 0; i--) {
        const st = o.stops[i];
        if (st.stopType !== 'dropoff') continue;
        const call = o.calls.find(c => c.id === st.orderId);
        if (!call || isHomeCallOf(call, o) !== o.isHome) continue;
        return Number.isFinite(call.dropoffX) && Number.isFinite(call.dropoffY) ? { x: call.dropoffX as number, y: call.dropoffY as number } : null;
    }
    return null;
}

/** ✂️ **라인을 종착지까지 자른다** — 종착지에서 가장 가까운 점까지. 점이 둘보다 적으면 빈 라인 */
export function lineUntil<T extends { x: number; y: number }>(line: ReadonlyArray<T>, pt: { x: number; y: number }): T[] {
    if (line.length < 2) return [];
    const kx = Math.cos((pt.y * Math.PI) / 180);
    let best = Infinity, at = 0;
    line.forEach((p, i) => {
        const d = ((p.x - pt.x) * kx) ** 2 + (p.y - pt.y) ** 2;
        if (d < best) { best = d; at = i; }
    });
    return line.slice(0, at + 1);
}

/**
 * 🔵 **하차 목록 합치기** (기사님 확정 2026-09-15 · `docs/지금/필터.md` «하차 영역»).
 *
 * 먼 목적지 조각에 걸친 동에서 **상차 목록 동을 뺀다** · 🎯 가까이 온 목적지 동은 빼지 않는다 (관내콜).
 * 기사님: *"하차는 상차 영역을 빼야 해 — 상차한 지역에 하차하지 않을꺼 같아. 역방향도 많이 걸릴꺼 같고"*.
 * 🔴 **동 목록으로 뺀다** — 원달앱은 상차지 동이 상차 목록에 있어야 콜을 잡는다(`PickupListFilter.check`). 그래서 이렇게 빼면
 *    «싣는 동에 내리는 콜»이 정확히 막힌다. 도형으로 빼면 경계에 걸친 큰 읍·면이 두 목록에 다 남아 샌다.
 * 진행도(지나온 곳 빼기): 같은 동이 여럿이면 먼 쪽 · **어느 조각에서든 진행도 없이 들었으면 없앤다** («아직 안 간 곳» · `callNet.lineZoneOf` 의 `onlyByLine`).
 *    가까이 온 목적지에서 든 동은 진행도가 없다.
 */
export function mergeDropoffGroups(
    parts: ReadonlyArray<{ near: boolean; grouped: Record<string, string[]>; progressKm: Record<string, number> }>,
    pickupList: readonly string[],
): { grouped: Record<string, string[]>; flat: string[]; progressKm: Record<string, number> } {
    const pick = new Set(pickupList);
    const groups: Record<string, Set<string>> = {};
    const progressKm: Record<string, number> = {};
    const unvisited = new Set<string>();
    for (const part of parts) {
        for (const [region, names] of Object.entries(part.grouped)) {
            for (const name of names) {
                if (!part.near && pick.has(name)) continue;
                (groups[region] ??= new Set()).add(name);
                const km = part.near ? undefined : part.progressKm[name];
                if (km === undefined) unvisited.add(name);
                else if (progressKm[name] === undefined || km > progressKm[name]) progressKm[name] = km;
            }
        }
    }
    for (const name of unvisited) delete progressKm[name];
    const grouped = Object.fromEntries(Object.entries(groups).map(([region, set]) => [region, [...set].sort()]));
    return { grouped, flat: [...new Set(Object.values(grouped).flat())].sort(), progressKm };
}
