import { buildOrderSync, getActiveCalls } from '../../src/core/helpers';

/**
 * [2026-08-10] 관제탑 페이로드는 **진행/종료를 나눠서** 보낸다.
 *
 * 한 배열로 보내던 시절, 받는 쪽마다 isTerminal 을 기억해야 했고 잊으면 조용히 틀렸다.
 * 하루에 세 번 났다 — AA(적재 7건) · BB(취소한 콜 재탐색) · DD(취소분까지 운임 합산).
 * "기억해야 하는 규칙"을 "고를 수 없는 구조"로 바꾼 것이 이 함수다.
 */
function makeSession(statuses: string[]) {
    const orders = statuses.map((status, i) => ({ id: `o${i}`, status } as any));
    return { myOrders: orders, pendingOrdersData: new Map(orders.map(o => [o.id, o])) };
}

describe('buildOrderSync — 진행/종료 분리', () => {
    it('진행 중인 것만 active 로 간다', () => {
        const s = makeSession(['ORDER_CONFIRMED', 'ORDER_PICKED_UP', 'ORDER_CANCELED']);
        const { active } = buildOrderSync(s);
        expect(active.map(o => o.status)).toEqual(['ORDER_CONFIRMED', 'ORDER_PICKED_UP']);
    });

    it('종료된 것은 전부 terminated 로 간다 (탭 표시용)', () => {
        const s = makeSession(['ORDER_DELIVERED', 'ORDER_COMPLETED', 'ORDER_RELEASED', 'ORDER_CANCELED', 'ORDER_FORCE_CANCELED']);
        const { active, terminated } = buildOrderSync(s);
        expect(active).toHaveLength(0);
        expect(terminated).toHaveLength(5);
    });

    it('🔴 하차 완료는 종료다 — 적재 계산에서 빠져야 한다', () => {
        const s = makeSession(['ORDER_CONFIRMED', 'ORDER_DELIVERED']);
        const { active, terminated } = buildOrderSync(s);
        expect(active).toHaveLength(1);
        expect(terminated).toHaveLength(1);
    });

    it('두 배열을 합치면 원본이 된다 — 어느 쪽에서도 콜이 사라지지 않는다', () => {
        const s = makeSession(['ORDER_CONFIRMED', 'ORDER_CANCELED', 'ORDER_PICKED_UP', 'ORDER_COMPLETED']);
        const { active, terminated } = buildOrderSync(s);
        expect(active.length + terminated.length).toBe(4);
    });

    it('getActiveCalls 와 active 가 항상 같은 집합이다', () => {
        const s = makeSession(['ORDER_CONFIRMED', 'ORDER_DELIVERED', 'ORDER_PICKED_UP']);
        expect(buildOrderSync(s).active.map(o => o.id)).toEqual(getActiveCalls(s as any).map(o => o.id));
    });

    it('빈 세션도 안전하다', () => {
        expect(buildOrderSync(makeSession([]))).toEqual({ active: [], terminated: [] });
    });
});
