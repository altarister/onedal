/**
 * 🧩 **필터 영역 — 살아 있는 목적지마다 상태 셋** (`docs/지금/필터.md` «필터 영역» · «상차 영역» · «하차 영역»).
 *
 * «목적지»는 기사님이 정한 곳이다 — 파주든 집이든 목적지다. 목적지마다 그 목적지 콜을 보고 상태 하나를 낸다.
 *
 * | 상태 | 뜻 | 필터 영역 | 상차 영역 |
 * |---|---|---|---|
 * | `idle`    | 그 목적지 콜 없음        | A ∪ Q(현위치→목적지) ∪ 목적지 영역 | A |
 * | `routed`  | 콜을 잡아 경로가 생김 (운행 전) | A ∪ 라인 ∪ Q(확정콜의 마지막 하차지→목적지) ∪ 목적지 영역 | A |
 * | `driving` | 운행 시작 뒤             | (A ∩ 라인) ∪ 라인 ∪ Q(확정콜의 마지막 하차지→목적지) ∪ 목적지 영역 | A ∩ 라인 |
 *
 * 🏘️ **관내는 따로 없다** — 목적지에서 콜을 다 내리면 그 목적지는 그냥 `idle` 이다
 *    (기사님: 다른 곳을 정하지 않았으면 도착한 곳에서 일한다).
 *
 * 🔴 **읽는 곳** — 관제웹 «상차» · «하차» 레이어(`StageView`)와 서버 상차 · 하차 목록(`filterManager.goalZonesNow` → `rebuildPickupList` · `netOfGoals`)이
 *    **같은 함수**를 부른다 — 따로 계산하면 지도와 목록이 갈라진다.
 */

import { cityCenter, quadOutline, haversineKm, type NetParams } from './callNet';
import { DONG_CENTROIDS } from './dongCentroids';

export type GoalState = 'idle' | 'routed' | 'driving';

export interface GoalZone {
    city: string;
    /** 집(복귀 목적지)인가 */
    isHome: boolean;
    state: GoalState;
    /** 🎯 목적지 가까이 옴 — `withNearness` 가 채운다. 없으면 «멀다»로 본다 */
    nearGoal?: boolean;
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
 * 🟢 **상차 영역 — 재료마다 스위치를 따로 답한다** (`docs/기획/필터_재료_스위치_표.md` · `docs/지금/필터.md` «상차 영역»).
 *
 * | 상태 | A 현위치 | L 라인 | D 목적지 | = |
 * |---|:---:|:---:|:---:|---|
 * | 콜 없음 · 경로 생김 | ✅ | ❌ | ❌ | A |
 * | 운행 뒤 | ✅ | ✅ | ❌ | A ∩ L |
 * | 🎯 목적지에 가까이 옴 | ✅ | 상태가 정한다 | ✅ | A ∩ D (운행 뒤면 ∩ L) |
 *
 * 🔴 **모양 하나를 통째로 고르지 않는다** — 그러면 조건 하나가 재료 여럿의 스위치를 동시에 누른다.
 *    거리를 넓히는 일(반경)과 방향을 버리는 일(라인 끄기)은 다른 일이다.
 *
 * 🔴 **A 는 늘 켜진다** — 기사님: *"아무리 빨리 가도 마름모 영역까지 상차를 20분 안에 할 수 없잖아."*
 *    그래서 마름모(Q)는 상차에 안 쓴다.
 * 🔴 **「목적지에 가까이 옴」은 라인을 끄지 않는다** (기사님 확정 ①) — 목적지에 닿아 콜을 다 내리면
 *    상태가 «콜 없음»이 되어 라인이 **저절로** 없어진다. 콜을 쥐고 달리는 중이면 그 길을 따라가야 한다.
 * 🔴 **라인은 전부 운행 뒤일 때만** — 하나라도 안 떠났으면 그 목적지에는 자를 라인이 없다.
 */
export function pickupPartsOf(zones: ReadonlyArray<GoalZone>): { me: boolean; line: boolean; goal: boolean } | null {
    if (zones.length === 0) return null;
    return {
        me: true,
        line: zones.every(z => z.state === 'driving'),
        goal: zones.some(z => z.nearGoal),
    };
}

/**
 * 🎯 **목적지에 가까이 옴** (`docs/지금/필터.md` «필터 영역»).
 *
 * **Q(현위치→목적지) 마름모가 현위치 원 ∪ 목적지 원 안에 통째로 들어가면** 가까이 옴 — 상차 A 전체.
 * 🔴 판단 마름모는 목적지 상태와 상관없이 늘 **현위치 → 목적지**다.
 * 테두리 점(`quadOutline` · 2° 광선)이 전부 두 원 중 하나 안에 드는가로 잰다.
 *
 * 🔴 **이 식은 기사님이 말씀하신 뜻과 아직 맞지 않는다** (결정 대기).
 *    기사님: *"「목적지에 가까이 옴」이라 했다면 모든 점이 상차지이고 하차지일 수 있어야 하므로 **모두 보라색 점**이어야 한다."*
 *    그러려면 상차 목록과 하차 목록이 같아야 하는데, 지금은 상차가 **현위치 원**이고 하차가 **목적지 원**이라
 *    중심이 달라 절대 같아지지 않는다. 그리고 이 식은 두 원이 크면 **출발점에서도 참**이라,
 *    라인 자르기가 꺼져 뒤쪽 상차가 통과한다 — 복정에서 26.5km 뒤 도척면이 상차 목록에 들어왔다.
 *    고치는 방향은 «가까이 옴이면 상차도 목적지 원을 본다» — 기사님 결정 뒤에 바꾼다.
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
        try { goal = cityCenter(z.city); } catch { return { ...z, nearGoal: false }; }
        if (!Number.isFinite(goal.lng) || !Number.isFinite(goal.lat)) return { ...z, nearGoal: false };
        return { ...z, nearGoal: isNearGoal({ me: o.me, goal, params: o.params }) };
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
 * | `routed`  | 현위치 원 ∪ 라인 ∪ Q(확정콜의 마지막 하차지→목적지) ∪ 목적지 원 |
 * | `driving` | 라인 ∪ Q(확정콜의 마지막 하차지→목적지) ∪ 목적지 원 — (A ∩ 라인)은 라인 안이라 현위치 원을 따로 안 넣는다 |
 *
 * @param hasLine 그 목적지의 라인이 있나 — 🔷 동선이거나 경로를 모르면 없다. 그때는 라인 · 확정콜의 마지막 하차지 없이 마름모를 현위치에서 잰다 (라인을 지어내지 않는다 · 규칙 ④).
 *    🔴 운행 뒤에는 라인이 없어도 현위치 원을 다시 넣지 않는다 — 상차가 A ∩ 라인이면 라인 밖 A 동이 상차 목록에 없어 안 빠지고,
 *    «뒤쪽 동에 내리는 콜»이 샌다 (버그 대장 #148)
 */
export function dropoffPartsOf(state: GoalState, hasLine: boolean, nearGoal = false): { me: boolean; line: boolean; quadFrom: 'me' | 'lastDrop' | null } {
    /* 🎯 가까이 온 목적지는 목적지 원 전체뿐 — 상차 목록 동도 빼지 않는다 (필터.md «하차 영역») */
    /**
     * 🔴 **현위치 원(A)은 하차 조각에 넣지 않는다** (기사님 확정).
     *
     * A 는 사방으로 퍼진 원이라 뒤쪽 동까지 하차 후보가 됐고, 그것을 «상차 목록 빼기»로 지웠다.
     * 그런데 상차 목록도 A 라서 **A 를 넣었다가 A 를 도로 빼는 꼴**이었고, 그 과정에서
     * A 와 마름모가 겹치는 **가는 방향의 동까지 함께 지워졌다** — 광주(집)에서 이천으로 갈 때
     * 신둔면이 상차 반경 안이라는 이유로 하차에서 빠져 «광주 → 신둔면»을 못 잡았다.
     * A 를 안 넣으면 하차 영역이 «마름모 ∪ 목적지 원»만 남아 방향이 저절로 지켜진다.
     */
    if (nearGoal) return { me: false, line: false, quadFrom: null };
    if (state === 'idle') return { me: false, line: false, quadFrom: 'me' };
    if (!hasLine) return { me: false, line: false, quadFrom: 'me' };
    return { me: false, line: true, quadFrom: 'lastDrop' };
}

/**
 * 🏁 **목적지마다 경로의 확정콜의 마지막 하차지** — 경로 순서(`routeStops`)에서 그 목적지 콜의 **마지막 하차지**.
 *    목적지가 집이어도 같다.
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

/** ✂️ 같은 곳을 다시 지난 것으로 보는 폭 — 가장 가까운 거리에서 이만큼 안이면 같은 자리다 */
const LINE_UNTIL_SAME_SPOT_KM = 0.2;

/**
 * ✂️ **라인을 확정콜의 마지막 하차지까지 자른다** — 확정콜의 마지막 하차지에서 가장 가까운 점까지. 점이 둘보다 적으면 빈 라인.
 * 🔴 같은 곳을 두 번 지나면 **뒤에 지나는 쪽**까지 자른다 — 확정콜의 마지막 하차지는 그 목적지의 **마지막** 하차지라서다.
 *    앞 통과에서 자르면 «신둔 → 이천터미널 → 신둔 → 집»처럼 되돌아오는 라인을 잃는다 (버그 대장 #148).
 */
export function lineUntil<T extends { x: number; y: number }>(line: ReadonlyArray<T>, pt: { x: number; y: number }): T[] {
    if (line.length < 2) return [];
    const kx = Math.cos((pt.y * Math.PI) / 180);
    const km = line.map(p => Math.hypot((p.x - pt.x) * kx, p.y - pt.y) * 111.32);
    const nearest = Math.min(...km);
    let at = 0;
    km.forEach((d, i) => { if (d <= nearest + LINE_UNTIL_SAME_SPOT_KM) at = i; });
    return line.slice(0, at + 1);
}

/**
 * 🔵 **하차 목록 합치기** (`docs/지금/필터.md` «하차 영역»).
 *
 * 조각에 걸친 동을 그대로 합친다.
 *
 * 🔴 **상차 목록을 빼지 않는다** (기사님 확정 — *"하차지에서 상차지 빼는 것을 하지 말자.
 *    지금은 상차지 하차지가 나뉘어 있으니
 *    하차지는 무조건 역방향은 없다"*). 하차 조각에서 현위치 원(A)을 빼고 나면
 *    하차 영역은 «마름모 ∪ 목적지 원»뿐이라 **방향이 저절로 지켜진다** — 역방향이 애초에 안 든다.
 *    그런데도 빼면 A 와 마름모가 겹치는 **가는 방향의 동까지 지워졌다**:
 *    광주(집)에서 이천으로 갈 때 신둔면이 상차 반경 안이라는 이유로 하차 27곳에서 빠져
 *    «광주 → 신둔면»(명백한 전진 콜)을 못 잡았다.
 * ⚠️ 옛 규칙이 막던 «싣는 동에 내리는 콜»은 요금 필터가 거른다 — 짧은 거리라 요금이 낮다.
 * 진행도(지나온 곳 빼기): 같은 동이 여럿이면 먼 쪽 · **어느 조각에서든 진행도 없이 들었으면 없앤다** («아직 안 간 곳» · `callNet.lineZoneOf` 의 `onlyByLine`).
 *    가까이 온 목적지에서 든 동은 진행도가 없다.
 */
export function mergeDropoffGroups(
    parts: ReadonlyArray<{ nearGoal: boolean; grouped: Record<string, string[]>; progressKm: Record<string, number> }>,
    /**
     * 상차 목록 — 시 · 군 · 구로 묶은 것 (`geoService.pickupListFor` 의 `grouped`).
     * 🔴 **지금은 쓰지 않는다** — 빼기를 없앴다. 자리를 남겨 둔 것은 서버가 이 꼴로 부르는지
     *    무는 짝 검사(`netFilterOneWay` · `pickupListGeo`)가 호출 모양을 보기 때문이다.
     */
    pickupGroups: Readonly<Record<string, readonly string[]>>,
): { grouped: Record<string, string[]>; flat: string[]; progressKm: Record<string, number> } {
    void pickupGroups;
    const groups: Record<string, Set<string>> = {};
    const progressKm: Record<string, number> = {};
    const unvisited = new Set<string>();
    for (const part of parts) {
        for (const [region, names] of Object.entries(part.grouped)) {
            for (const name of names) {
                (groups[region] ??= new Set()).add(name);
                const km = part.nearGoal ? undefined : part.progressKm[name];
                if (km === undefined) unvisited.add(name);
                else if (progressKm[name] === undefined || km > progressKm[name]) progressKm[name] = km;
            }
        }
    }
    for (const name of unvisited) delete progressKm[name];
    const grouped = Object.fromEntries(Object.entries(groups).map(([region, set]) => [region, [...set].sort()]));
    return { grouped, flat: [...new Set(Object.values(grouped).flat())].sort(), progressKm };
}

/** 📍 동 점 하나 — 동 중심점 */
export interface DongDot { x: number; y: number; name: string; region: string }

/**
 * 📍 **지도 동 점 — 원달앱에 실제로 내려간 목록**.
 *
 * 상차 목록(`pickupGroups`) · 하차 목록(`destinationGroups`)을 **«시·군·구 + 동»으로** 동 중심점에 찍는다.
 * 🔴 지도가 따로 계산해 찍지 않는다 — 제 계산으로 찍으면 원달앱 목록과 달라진다. 이 점은 목록 그 자체다.
 * 🔴 이름만 맞추지 않는다 — 같은 이름의 다른 동에 찍히면 화면이 거짓말한다. 좌표를 모르는 동은 `missing` 으로 센다 (지어내지 않는다 · 규칙 ④).
 * 묶음 이름은 서버와 같은 칸(`intel.parentName`)이다 — `dropoffTouchGeo.test.ts` «같은 시 · 군 · 구 이름»이 잠근다.
 */
export function dongDotsOf(o: {
    pickupGroups: Readonly<Record<string, readonly string[]>>;
    dropoffGroups: Readonly<Record<string, readonly string[]>>;
}): { pickup: DongDot[]; dropoff: DongDot[]; both: DongDot[]; missing: number } {
    const keysOf = (g: Readonly<Record<string, readonly string[]>>) =>
        new Set(Object.entries(g).flatMap(([region, names]) => names.map(n => `${region}|${n}`)));
    const pick = keysOf(o.pickupGroups), drop = keysOf(o.dropoffGroups);
    const at = new Map<string, DongDot>();
    for (const [name, region, x, y] of DONG_CENTROIDS) {
        const key = `${region}|${name}`;
        if ((pick.has(key) || drop.has(key)) && !at.has(key)) at.set(key, { x, y, name, region });
    }
    const out = { pickup: [] as DongDot[], dropoff: [] as DongDot[], both: [] as DongDot[], missing: 0 };
    for (const key of new Set([...pick, ...drop])) {
        const d = at.get(key);
        if (!d) { out.missing++; continue; }
        (pick.has(key) && drop.has(key) ? out.both : pick.has(key) ? out.pickup : out.dropoff).push(d);
    }
    return out;
}
