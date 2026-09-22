import { buildOrderSync, getActiveCalls, setOrderStatus } from '../../src/core/helpers';

/**
 * 관제탑 페이로드는 **진행/종료를 나눠서** 보낸다.
 *
 * 한 배열로 보내면 받는 쪽마다 isTerminal 을 기억해야 하고, 잊으면 조용히 틀린다
 * (종료 콜까지 적재로 세기 · 취소한 콜 재탐색 · 취소분까지 운임 합산).
 * "기억해야 하는 규칙"을 "고를 수 없는 구조"로 바꾼 것이 이 함수다.
 */
function makeSession(statuses: string[]) {
    const orders = statuses.map((status, i) => ({ id: `o${i}`, status } as any));
    /* 📍 기점은 파생이라(originOf) 세션이 «마지막 받은 좌표»를 들고 있어야 한다 — 없으면 집 주소가 대신한다 */
    return { userId: 'u1', myOrders: orders, pendingOrdersData: new Map(orders.map(o => [o.id, o])),
             lastFix: null, lastFixAt: null };
}

describe('buildOrderSync — 진행/종료 분리', () => {
    it('진행 중인 것만 active 로 간다', () => {
        const s = makeSession(['ORDER_CONFIRMED', 'ORDER_PICKED_UP', 'SAFE_CANCEL']);
        const { active } = buildOrderSync(s);
        expect(active.map(o => o.status)).toEqual(['ORDER_CONFIRMED', 'ORDER_PICKED_UP']);
    });

    it('종료된 것은 전부 terminated 로 간다 (탭 표시용)', () => {
        const s = makeSession(['ORDER_DELIVERED', 'ORDER_COMPLETED', 'ORDER_RELEASED_BY_ME', 'SAFE_CANCEL', 'ORDER_RELEASED_BY_OFFICE']);
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
        const s = makeSession(['ORDER_CONFIRMED', 'SAFE_CANCEL', 'ORDER_PICKED_UP', 'ORDER_COMPLETED']);
        const { active, terminated } = buildOrderSync(s);
        expect(active.length + terminated.length).toBe(4);
    });

    it('getActiveCalls 와 active 가 항상 같은 집합이다', () => {
        const s = makeSession(['ORDER_CONFIRMED', 'ORDER_DELIVERED', 'ORDER_PICKED_UP']);
        expect(buildOrderSync(s).active.map(o => o.id)).toEqual(getActiveCalls(s as any).map(o => o.id));
    });

    it('빈 세션도 안전하다', () => {
        // 경로 홀더 이름도 봉투에 싣는다 (빈 세션이면 null)
        /**
         * 🧭 **경로 기점(`routeOrigin`)도 정거장 순서와 한 벌로 보낸다** (`helpers.ts` 주석 참조).
         *    지도가 제 손으로 위치를 정하면 서버가 아는 자리와 어긋난다 — 정거장 순서를 짠 그 기점을 같이 보낸다.
         *    빈 세션이면 좌표를 받은 적이 없으니 **홀더·기점 둘 다 null** 이다 — 지어내지 않는다 (규칙 ④).
         */
        expect(buildOrderSync(makeSession([]))).toEqual({ active: [], terminated: [], routeStops: [], routeComputedAt: null, routeHolderId: null,
            previewRouteHolderId: null, cancelCounts: {}, cancelRounds: {},
            routeOrigin: null });
    });
});

describe('🔴 setOrderStatus — 두 메모리를 함께 갱신한다', () => {
    // 세션은 같은 콜을 myOrders 와 pendingOrdersData 두 곳에 들고 있다.
    // 한쪽만 바꾸면 판정은 종료됐는데 관제탑에는 낡은 상태가 간다 —
    // "하차 완료했는데 카드에 상차 완료로 남아 있음". 그래서 setOrderStatus 가 둘을 함께 바꾼다.
    function dualSession() {
        const o: any = { id: 'x', status: 'ORDER_PICKED_UP' };
        // 같은 콜이지만 **다른 객체**인 경우가 실제로 있다 (복구 경로 등)
        const cached: any = { id: 'x', status: 'ORDER_PICKED_UP' };
        return { myOrders: [o], pendingOrdersData: new Map([['x', cached]]), o, cached };
    }

    it('두 곳 모두 바뀐다 (서로 다른 객체여도)', () => {
        const s = dualSession();
        expect(setOrderStatus(s as any, 'x', 'ORDER_DELIVERED')).toBe(true);
        expect(s.o.status).toBe('ORDER_DELIVERED');
        expect(s.cached.status).toBe('ORDER_DELIVERED');
    });

    it('갱신 후 관제탑 페이로드가 종료 쪽으로 간다', () => {
        const s = dualSession();
        setOrderStatus(s as any, 'x', 'ORDER_DELIVERED');
        const { active, terminated } = buildOrderSync(s as any);
        expect(active).toHaveLength(0);
        expect(terminated).toHaveLength(1);
    });

    it('🔴 한쪽만 낡아 있어도 myOrders 가 이긴다 (판정과 화면이 갈라지지 않는다)', () => {
        const s = dualSession();
        s.myOrders[0].status = 'ORDER_DELIVERED';   // setOrderStatus 를 거치지 않고 한쪽만 바꿔 본다
        const { active, terminated } = buildOrderSync(s as any);
        expect(active).toHaveLength(0);
        expect(terminated[0].status).toBe('ORDER_DELIVERED');
    });

    it('없는 오더면 false', () => {
        const s = dualSession();
        expect(setOrderStatus(s as any, '없음', 'ORDER_DELIVERED')).toBe(false);
    });

    it('평가 중 콜(pendingOrdersData 에만 있음)도 페이로드에 포함된다', () => {
        const s = { myOrders: [], pendingOrdersData: new Map([['e', { id: 'e', status: 'ORDER_AWAITING_DECISION' }]]) };
        expect(buildOrderSync(s as any).active).toHaveLength(1);
    });
});
