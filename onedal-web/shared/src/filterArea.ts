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
 * 🔴 **일부러 두 벌이다 (잠깐)** — 서버 상차 목록은 아직 옛 `pickupList.pickupAreaPlan` 으로 만든다.
 *    기사님과 정한 순서가 «지도에 먼저 그려 눈으로 맞춘 뒤 서버가 같은 도형으로 동을 찾는다»라서다.
 *    서버를 옮기는 날 `pickupAreaPlan` 을 걷는다 ([todo.md](../../../todo.md) «필터 영역 개정»).
 */

export type GoalState = 'idle' | 'routed' | 'driving';

export interface GoalZone {
    city: string;
    /** 집(복귀 목적지)인가 */
    isHome: boolean;
    state: GoalState;
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
    const isHomeCall = (c: { goalCity?: string | null }) => homeAlive && c.goalCity === o.homeCity;
    const homeCalls = o.activeCalls.filter(isHomeCall).length;
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
    return zones.every(z => z.state === 'driving') ? 'meLine' : 'me';
}
