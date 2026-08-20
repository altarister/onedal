import { buildOrderSync } from '../../src/core/helpers';

/**
 * 🧭 **정거장을 지나도 남은 주행분은 살아 있어야 한다** (기사님 실측 2026-08-21 · 3콜 리허설)
 *
 * 운행 내내 이 로그가 반복됐다:
 *
 *   `⚠️ 길이 어긋남(주행분 4 ≠ 정거장 3) → 전부 null`
 *
 * 정거장에 도착하면 `planArrivalStops` 가 그곳을 목록에서 빼는데, 경로 연산이 남긴
 * `sectionDriveMin` 은 **계산 시점의 정거장 수** 그대로다. 길이가 어긋나자 안전장치가
 * 주행분을 통째로 비웠고 — **도착할 때마다 다음 재계산 전까지 타임라인이 죽었다**
 * (예산 줄·검산 문장·카운트다운이 전부 이 값을 먹는다).
 *
 * 🔴 남은 정거장의 누적 주행분은 **여전히 옳은 값이다** — 닻(routeComputedAt)에서 잰
 *    상대값이라 낡지 않는다. 죽은 것은 값이 아니라 **자리 맞추기(인덱스)**였다.
 *
 * → 경로를 계산할 때 **구간마다 어느 정거장인지**(`sectionStops`)를 함께 남기고,
 *   내보낼 때 인덱스가 아니라 **(orderId, stopType) 키로** 맞춘다.
 *   다녀온 정거장은 조회가 안 될 뿐이고, 남은 정거장은 제 주행분을 그대로 찾는다.
 */

const CALL = {
    id: 'CALL-A', status: 'ORDER_CONFIRMED',
    pickupX: 127.1, pickupY: 37.4, dropoffX: 126.7, dropoffY: 37.7,
    sectionDriveMin: [10, 84],
    sectionStops: [
        { orderId: 'CALL-A', stopType: 'pickup' },
        { orderId: 'CALL-A', stopType: 'dropoff' },
    ],
    routeComputedAt: '2026-08-21T04:29:24Z',
};

const session = (over: object = {}) => ({
    myOrders: [{ ...CALL, ...over }],
    pendingOrdersData: new Map(),
    driverLocation: { x: 127.1, y: 37.4 },
}) as any;

describe('경로 순서 — 지나간 정거장 뒤에도 주행분이 산다', () => {
    it('아직 아무 데도 안 갔으면 둘 다 값이 있다', () => {
        const { routeStops } = buildOrderSync(session());
        expect(routeStops.map(s => s.driveMinutes)).toEqual([10, 84]);
    });

    it('🔴 상차지를 다녀오면 — 남은 하차지의 주행분(84)이 그대로 산다 (null 이 아니다)', () => {
        const { routeStops } = buildOrderSync(session({ arrivedPickupAt: '2026-08-21T04:30:22Z' }));
        expect(routeStops).toHaveLength(1);
        expect(routeStops[0]).toMatchObject({ orderId: 'CALL-A', stopType: 'dropoff', driveMinutes: 84 });
    });

    it('🔴 계산에 없던 새 정거장만 null — 전체를 비우지 않는다 (KEEP 직후 과도기)', () => {
        const s = session();
        s.myOrders.push({
            id: 'CALL-B', status: 'ORDER_CONFIRMED',
            pickupX: 127.11, pickupY: 37.41, dropoffX: 126.8, dropoffY: 37.8,
        });
        const { routeStops } = buildOrderSync(s);
        const of = (id: string, st: string) => routeStops.find(x => x.orderId === id && x.stopType === st)!;
        expect(of('CALL-A', 'pickup').driveMinutes).toBe(10);    // 아는 것은 안다
        expect(of('CALL-A', 'dropoff').driveMinutes).toBe(84);
        expect(of('CALL-B', 'pickup').driveMinutes).toBeNull();  // 모르는 것만 모른다 (규칙 ④)
    });

    it('sectionStops 가 없는 옛 홀더는 예전 규칙 그대로 — 길이가 맞으면 인덱스로', () => {
        const { sectionStops, ...noStops } = CALL as any;
        const s = { myOrders: [noStops], pendingOrdersData: new Map(), driverLocation: { x: 127.1, y: 37.4 } } as any;
        const { routeStops } = buildOrderSync(s);
        expect(routeStops.map(x => x.driveMinutes)).toEqual([10, 84]);
    });
});
