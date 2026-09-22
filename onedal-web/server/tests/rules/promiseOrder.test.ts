import { planMergedStops } from '../../src/services/routeComposer';

/**
 * 🔴 **굳은 약속이 경로 순서를 정한다** (기사님 확정).
 *
 * 통화로 굳힌 약속은 지킨다. 그러므로 새 콜이 붙을 때도 **약속을 넘기지 않는 순서**를 먼저 고르고,
 * 그런 순서가 없으면 **가장 덜 늦는 순서**를 고른다. 약속이 하나도 없으면 지금처럼 «지나가는 길목부터»다.
 *
 * 🔴 순서만으로 다 지킬 수 없으면 그 사실이 드러나야 한다 — 기사님이 그 상차지에 전화해 시간을 미루신다.
 */
const KM = 0.01;                        // 경도 0.01 ≈ 0.88km · 계산은 haversine 이 한다
const here = { x: 127.00, y: 37.00 };
const at = (dx: number) => ({ x: 127.00 + dx * KM, y: 37.00 });

/** 콜 A — 상차가 더 멀다(15칸) · 하차 30칸 */
const A = { id: 'A', status: 'ORDER_CONFIRMED',
    pickupX: at(15).x, pickupY: at(15).y, dropoffX: at(30).x, dropoffY: at(30).y } as any;
/** 콜 B — 상차가 가깝다(10칸) · 하차 50칸 */
const B = { id: 'B', status: 'ORDER_CONFIRMED',
    pickupX: at(10).x, pickupY: at(10).y, dropoffX: at(50).x, dropoffY: at(50).y } as any;

const order = (calls: any[], opts?: any) =>
    (planMergedStops(calls, null, here, opts)?.orderedStops ?? []).map(s => `${s.orderId}:${s.stopType}`);

describe('경로 순서 — 굳은 약속을 먼저 본다', () => {
    it('약속이 없으면 지금처럼 가까운 곳부터다', () => {
        expect(order([A, B])[0]).toBe('B:pickup');       // 10칸이 15칸보다 가깝다
    });

    /**
     * A 상차에만 굳은 약속이 있다. B 상차를 먼저 들르면 상차 정차만큼 A 가 밀려 약속을 넘긴다.
     * 그러면 순서는 **A 상차 먼저**여야 한다 — 가까운 곳이 아니라 약속이 정한다.
     */
    it('🔴 굳은 약속이 있는 상차지를 먼저 들른다 — 가까운 곳보다 약속이 앞선다', () => {
        const now = Date.parse('2026-09-23T00:00:00Z');
        const promiseAt = (orderId: string, stopType: string) =>
            orderId === 'A' && stopType === 'pickup' ? now + 20 * 60_000 : null;
        expect(order([A, B], { nowMs: now, promiseAt })[0]).toBe('A:pickup');
    });
});
