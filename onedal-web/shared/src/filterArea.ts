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

import { cityCenter, haversineKm } from './callNet';
import { DONG_CENTROIDS } from './dongCentroids';

/**
 * 🎯 **살아 있는 목적지 하나 — «사실»만 담는다.**
 *
 * 🔴 **«출발했나»를 여기 담지 않는다** (설계서 ⑥). 그 목적지로 갈 콜이 있나(`hasCalls`)는 **목적지마다 다르고**,
 *    출발했나는 **목적지가 몇이든 하나**다. 둘을 한 칸(옛 `state`)에 담았더니 «내가 달리나»를 물으려고
 *    목적지 목록을 뒤지게 됐고, 복귀를 켜서 목적지가 둘이 되자 답이 뒤집혀 상차 라인이 통째로 꺼졌다.
 *    화면·로그에 쓸 이름이 필요하면 `goalStateLabel(hasCalls, departed)` 로 **그때 만든다.**
 */
export interface GoalZone {
    city: string;
    /** 집(복귀 목적지)인가 */
    isHome: boolean;
    /** 그 목적지로 갈 콜이 지금 있나 */
    hasCalls: boolean;
    /** 🎯 목적지 가까이 옴 — `withNearness` 가 채운다. 없으면 «멀다»로 본다 */
    nearGoal?: boolean;
}

/** 🏷️ **화면·로그에 적을 이름** — 계산에 쓰지 않는다 (뭉친 이름은 읽기에 좋고 계산에 나쁘다) */
export function goalStateLabel(hasCalls: boolean, departed: boolean): string {
    return !hasCalls ? '콜 없음' : departed ? '운행 뒤' : '경로 생김';
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
 *
 * 🔴 **«출발했나»를 받지 않는다** — 목적지가 사는 조건과 상관없다. 그 사실은 조각이 직접 본다 (설계서 ⑥)
 */
export function goalZonesOf(o: {
    destinationCity: string | null | undefined;
    homeCity: string | null | undefined;
    homeOn: boolean;
    homeCaught: boolean;
    activeCalls: ReadonlyArray<{ goalCity?: string | null }>;
}): GoalZone[] {
    const homeAlive = o.homeOn && !!o.homeCity;
    const homeCalls = o.activeCalls.filter(c => isHomeCallOf(c, o)).length;
    const destCalls = o.activeCalls.length - homeCalls;

    const zones: GoalZone[] = [];
    if (o.destinationCity && (!homeAlive || !o.homeCaught || destCalls > 0)) {
        zones.push({ city: o.destinationCity, isHome: false, hasCalls: destCalls > 0 });
    }
    if (homeAlive) zones.push({ city: o.homeCity as string, isHome: true, hasCalls: homeCalls > 0 });
    return zones;
}

/**
 * 🟢 **상차 조각 — 각자 자기 사실만 본다** (`docs/기획/필터_파이프라인_설계.md` ⑥).
 *
 * 상차의 주어는 **나**다. 「내가 20분 안에 가서 실을 수 있고, 내가 지금 달리는 길에 있는 곳」이다.
 * 목적지가 몇이든 나는 하나고 내가 달리는 길도 하나다. 그래서 **목적지 목록을 받지 않는다.**
 *
 * | 조각 | 켜지는 조건 | 주인 |
 * |---|---|---|
 * | 현위치 원 | 늘 (반환에 없다 — 부르는 쪽이 늘 넣는다) | 나 |
 * | 라인 띠 | 출발했고 경로가 있으면 | 나 |
 * | 목적지 원 | 가까이 온 목적지가 있으면 — 그 원들을 **더한다**(∪) | 목적지마다 |
 *
 * 켜진 조각을 **전부 겹친다**(∩) — 상차는 «다 만족해야» 갈 수 있다.
 *
 * 🔴 **「내가 달리나」를 목적지 목록으로 묻지 않는다.** 옛 코드는 `zones.every(z => z.state === 'driving')`
 *    이었고, 복귀를 켜서 목적지가 둘이 되자 하나가 «콜 없음»이라 거짓이 되어 **라인이 통째로 꺼졌다.**
 *    실측으로 상차지가 118곳에서 419곳으로 늘었다 — 뒤쪽 상차가 전부 통과했다.
 * 🔴 **가까이 온 목적지가 둘이면 두 원을 더한다**(∪) — 겹치면(∩) 두 원이 안 만날 때 영역이 비고,
 *    빈 영역은 «전부 통과»가 아니라 «고장»이다 (규칙 ④).
 * 🔴 **마름모는 상차에 안 쓴다** — 기사님: *"아무리 빨리 가도 마름모 영역까지 상차를 20분 안에 할 수 없잖아."*
 * 🔴 **「가까이 옴」이 라인을 끄지 않는다** — 목적지 원을 **더할** 뿐이다. 목적지에 닿아 콜을 다 내리면
 *    경로가 없어져 라인이 저절로 사라진다. 조건 하나가 재료 여럿을 끄면 거리를 넓히는 일과
 *    방향을 버리는 일을 한 손이 하게 된다.
 */
export function pickupPartsOf(o: {
    /** 출발을 눌렀나 — 목적지가 몇이든 하나다 */
    departed: boolean;
    /** 확정된 경로가 있나 (🔷 동선이면 없다) */
    hasLine: boolean;
    /** 가까이 온 목적지의 시 이름 — 없으면 빈 배열 */
    nearGoalCities: ReadonlyArray<string>;
}): { line: boolean; goalCities: readonly string[] } {
    return {
        line: o.departed && o.hasLine,
        goalCities: o.nearGoalCities,
    };
}

/**
 * 🎯 **목적지에 가까이 옴 — 내가 그 목적지 영역 안에 들어왔나** (설계서 ⑥).
 *
 * 🔴 **목적지 반경 하나로만 잰다 — 현위치 반경을 더하지 않는다.** 기사님이 목적지 반경을 정하신 것이
 *    곧 *"이만큼이 내 목적지 근처다"* 라는 말씀이다. 두 반경을 합쳐 보면 내가 정한 근처보다 훨씬
 *    멀리서 켜진다 — 목적지 반경 22 · 현위치 반경 18.6 에서 옛 식은 40km 밖까지 참이었다.
 * 🔴 켜지면 하는 일은 **더하기뿐**이다 — 상차에 목적지 원을 더하고(`pickupPartsOf`),
 *    하차에서 상차 목록 동을 안 뺀다. 라인·마름모는 끄지 않는다.
 */
export function isNearGoal(o: {
    me: { x: number; y: number };
    goal: { lng: number; lat: number };
    destinationRadiusKm: number;
}): boolean {
    return haversineKm({ lng: o.me.x, lat: o.me.y }, { lng: o.goal.lng, lat: o.goal.lat })
        <= Math.max(0, o.destinationRadiusKm);
}

/** 🎯 목적지마다 «가까이 옴»을 채운다 — 지도에 없는 시(좌표를 모름)는 «멀다»로 둔다 (지어내지 않는다 · 규칙 ④) */
export function withNearness(
    zones: ReadonlyArray<GoalZone>,
    o: { me: { x: number; y: number }; destinationRadiusKm: number },
): GoalZone[] {
    return zones.map(z => {
        let goal: { lng: number; lat: number };
        try { goal = cityCenter(z.city); } catch { return { ...z, nearGoal: false }; }
        if (!Number.isFinite(goal.lng) || !Number.isFinite(goal.lat)) return { ...z, nearGoal: false };
        return { ...z, nearGoal: isNearGoal({ me: o.me, goal, destinationRadiusKm: o.destinationRadiusKm }) };
    });
}

/** 🎯 가까이 온 목적지의 시 이름만 — 상차의 목적지 원은 이 시들의 원을 **더한** 것이다(∪) */
export function nearGoalCitiesOf(zones: ReadonlyArray<GoalZone>): string[] {
    return zones.filter(z => z.nearGoal).map(z => z.city);
}

/** 🏠 **이 콜이 집 콜인가** — 복귀 켬이고 판(`goalCity`)이 집이면 집 콜 · 나머지는 목적지 콜. 콜의 주인은 여기 한 곳이 가른다 */
export function isHomeCallOf(call: { goalCity?: string | null }, o: { homeOn: boolean; homeCity: string | null | undefined }): boolean {
    return o.homeOn && !!o.homeCity && call.goalCity === o.homeCity;
}

/**
 * 🔵 **하차 조각 — 그 목적지 하나에 넣는 것** (`docs/기획/필터_파이프라인_설계.md` ⑥).
 *
 * 하차의 주어는 **목적지**다. 「그 목적지 쪽으로 가는 곳」이라 목적지마다 만들어 **더한다**(∪).
 * 목적지 원은 늘 넣으므로 여기 없다 — 부르는 쪽이 늘 넣는다.
 *
 * | 그 목적지까지 자른 라인이 | 라인 띠 | 마름모 시작점 |
 * |---|---|---|
 * | 있다 | ✅ | 확정콜의 마지막 하차지 |
 * | 없다 | ❌ | 현위치 |
 *
 * 🔴 **묻는 것이 하나다.** 옛 코드는 목적지 «상태»와 «가까이 옴»까지 셋을 봤는데, 세 갈래가 결국
 *    이 하나로 갈렸다 — 콜이 없으면 마지막 하차지가 없어 라인도 없고, 「가까이 옴」은 재료를 끄지 않는다.
 * 🔴 **「가까이 옴」이 여기 들어오지 않는다** — 받을 수 없으면 끌 수도 없다. 가까이 옴이 하차에서
 *    하는 일은 «상차 목록 동을 안 뺀다» 하나뿐이고 그것은 합치는 쪽(`mergeDropoffGroups`)이 안다.
 * 🔴 **현위치 원(A)은 하차 조각에 넣지 않는다** (기사님 확정). A 는 사방으로 퍼진 원이라 뒤쪽 동까지
 *    하차 후보가 됐고, 그것을 빼다가 **가는 방향의 동까지 함께 지워졌다** — 광주(집)에서 이천으로 갈 때
 *    신둔면이 상차 반경 안이라는 이유로 하차에서 빠져 «광주 → 신둔면»을 못 잡았다.
 * 🔴 **라인이 없다고 현위치 원을 다시 넣지 않는다** — 상차가 A ∩ 라인이면 라인 밖 A 동이 상차 목록에
 *    없어 안 빠지고 «뒤쪽 동에 내리는 콜»이 샌다 (버그 대장 #148).
 *
 * @param hasLine 그 목적지의 라인이 있나 — 🔷 동선이거나 경로를 모르면 없다 (라인을 지어내지 않는다 · 규칙 ④)
 */
export function dropoffPartsOf(hasLine: boolean): { line: boolean; quadFrom: 'me' | 'lastDrop' } {
    return hasLine ? { line: true, quadFrom: 'lastDrop' } : { line: false, quadFrom: 'me' };
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
