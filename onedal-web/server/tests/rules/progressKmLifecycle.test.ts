import { buildAppOrderKm } from '../../src/state/filterManager';

/**
 * 🧭 **progressKm 의 수명 = 진행 중 경로의 수명** (2026-08-22 실측 · 버그 대장 #39)
 *
 * 앱의 순서 검사(RouteOrderFilter)는 progressKm 이 **비어 있지 않으면** 발동하고,
 * "상차지가 목록에 없으면 경로 밖 → 차단"한다. 그런데 사이클이 끝나 STANDBY 로
 * 돌아온 뒤에도 옛 경로의 detourProgressKm 잔재가 세션에 남아, 첫짐 탐색 중에
 * 180동(178개 null)이 피기백으로 내려갔다 — **옛 경유 목록 밖 상차지의 첫짐
 * 후보가 전부 차단**된다. "앱은 느슨하게 올린다"(규칙 ⑤) 정면 위반.
 *
 * 원천이 없으면 파생도 없다 (규칙 ③): 활성 콜 0 = 진행 중 경로 없음 = 순서 없음.
 */
const sessionLike = (over: Record<string, unknown>) => ({
    myOrders: [],
    pendingOrdersData: new Map(),
    activeFilter: { destinationKeywords: ['금촌동', '문산읍'], dispatchPhase: 'STANDBY' },
    // 앱에 내려가는 순서의 원천은 순서 전용 detourOrderKm 이다 (#78 — 트림용과 갈라짐)
    detourOrderKm: { '금촌동': 12.3 },
    ...over,
}) as any;

it('🔴 활성 콜이 없으면 빈 객체 — 옛 경로 잔재로 첫짐을 차단하지 않는다', () => {
    expect(buildAppOrderKm(sessionLike({}))).toEqual({});
});

it('진행 중이면 경로 진행도를 내려보낸다 (기존 동작 보존)', () => {
    const s = sessionLike({ myOrders: [{ id: 'a', status: 'ORDER_CONFIRMED' }] });
    expect(buildAppOrderKm(s)['금촌동']).toBe(12.3);
});
