import { planArrivalStops } from '../../src/services/routeComposer';

/**
 * 🧭 **순서는 살아 있되, 근소한 차이로는 안 뒤집힌다** (기사님 승인 2026-09-01)
 *
 * ── 실측: 서버가 스스로 두 순서를 오갔다 ──
 * 02:20 판에서 관제웹 번호가 **9번 찍히며** 두 순서를 오갔다. 서버 로그를 겹쳐 보니
 * 서버가 같은 닻·같은 4정거장으로 2~10초마다 다른 답을 내고 있었다.
 *
 * 뿌리는 `orderByNearest` 다 — **가장 가까운 곳부터** 잇는 탐욕법인데, 그것을 1초 동기화와
 * GPS 매 틱이 부른다. 기사님이 달리는 동안 기점이 매초 바뀌므로, 두 후보가 엇비슷하면
 * **몇십 미터 움직인 것만으로 1번이 바뀐다.** 화면에서는 번호가 춤춘다.
 *
 * ── 한 번 틀린 길 (2026-09-01 새벽 · 기록으로 남긴다) ──
 * 처음에는 «저장된 순서(`sectionStops`)를 그대로 되쓰자»고 제안했고 기사님 승인까지 받았다.
 * **틀렸다.** `pnpm drive` 가 두 건을 잡았다:
 *   · 2.4km 앞 하차지를 두고 먼 상차지로 먼저 갔다
 *   · **합짐2 하차의 도착이 아예 안 찍혔다**
 * 도착 감시는 «아직 안 찍힌 첫 정거장» 하나만 본다. 얼린 순서가 실제 동선과 어긋나면
 * 그 정거장이 «다음»이 될 차례가 영영 안 와서, 차가 앞을 지나가도 안 찍힌다.
 * 그때 새로 쓴 단위 검사는 **새 원천만 불러서** 전부 초록이었다 — `singleSource.test.ts`
 * 맨 위에 적어 둔 바로 그 병을 하루 만에 반복했다.
 *
 * → 얻은 것: **순서는 살아 있어야 한다.** 고칠 것은 «다시 세우는 것»이 아니라 «근소한
 *   차이에 뒤집히는 것»이다. 그래서 얼리지 않고 **버티게** 한다 —
 *   직전에 정한 순서(`sectionStops`)를 **동점 근처에서만** 편든다.
 */
const call = (id: string, over: object = {}) => ({
    id, status: 'ORDER_CONFIRMED',
    pickupX: 127.31, pickupY: 37.36, dropoffX: 127.38, dropoffY: 37.29,
    ...over,
}) as any;

const name = (sts: Array<{ orderId: string; stopType: string }>) =>
    sts.map(s => `${s.orderId}${s.stopType === 'pickup' ? '상' : '하'}`).join(' ');

describe('갈 순서 — 흔들리지 않되 얼지도 않는다', () => {
    /**
     * 두 하차지가 기점에서 **거의 같은 거리**에 있다. 상차는 둘 다 끝났다(짐을 실었다).
     * 기점이 조금 움직이면 «가장 가까운 곳»이 바뀌는데, 그게 곧 화면의 번호가 춤추는 자리다.
     */
    const tiedPair = (saved?: Array<{ orderId: string; stopType: 'dropoff' }>) => ([
        call('A', {
            arrivedPickupAt: '2026-09-01T02:00:00+09:00',
            dropoffX: 127.400, dropoffY: 37.300,
        }),
        call('B', {
            arrivedPickupAt: '2026-09-01T02:00:00+09:00',
            dropoffX: 127.450, dropoffY: 37.300,          // A 하차지에서 4.4km — 기점은 그 중간
            ...(saved ? { sectionDriveMin: [10, 20], sectionStops: saved } : {}),
        }),
    ]);

    /** 직전에 정한 순서 — A 하차가 1번이었다 */
    const SAVED_A_FIRST = [
        { orderId: 'A', stopType: 'dropoff' as const },
        { orderId: 'B', stopType: 'dropoff' as const },
    ];

    it('🔴 직전 순서가 있으면 근소한 차이로는 안 뒤집힌다 — 기점이 움직여도 그대로', () => {
        const seen = new Set<string>();
        // B 하차지 쪽으로 조금씩 다가간다 — 매 틱 «가장 가까운 곳»이 A→B 로 넘어가는 구간
        for (const gps of [
            { x: 127.4240, y: 37.300 },   // A 쪽이 근소하게 가깝다
            { x: 127.4255, y: 37.300 },   // 넘어가는 지점
            { x: 127.4260, y: 37.300 },   // B 쪽이 근소하게 가깝다 — 예전엔 여기서 뒤집혔다
            { x: 127.4270, y: 37.300 },
        ]) seen.add(name(planArrivalStops(tiedPair(SAVED_A_FIRST), gps)));
        expect([...seen]).toEqual(['A하 B하']);
    });

    it('🔴 직전 순서가 없으면 예전 그대로 — 가장 가까운 곳부터', () => {
        // B 하차지 바로 옆에서 물으면 B 가 먼저다 (편들 직전 순서가 없다)
        expect(name(planArrivalStops(tiedPair(), { x: 127.4270, y: 37.300 }))).toBe('B하 A하');
    });

    it('🔴 진짜로 더 좋은 길이면 바뀐다 — 얼리는 것이 아니다 (drive 가 잡았던 사고)', () => {
        /**
         * 직전 순서는 «먼 상차지 먼저»라고 말하는데, 코앞(2.4km)에 하차지가 있다.
         * 얼렸더니 먼 상차지로 갔고 도착 하나가 통째로 안 찍혔다 — 그 자리를 여기서 막는다.
         */
        const near = call('N', {
            arrivedPickupAt: '2026-09-01T02:00:00+09:00',
            dropoffX: 127.402, dropoffY: 37.300,                       // 기점에서 ~2km
        });
        const far = call('F', {
            pickupX: 127.700, pickupY: 37.500, dropoffX: 127.800, dropoffY: 37.600,   // 아주 멀다
            sectionDriveMin: [10, 20, 30],
            sectionStops: [
                { orderId: 'F', stopType: 'pickup' },                  // 직전 순서는 먼 상차지 먼저
                { orderId: 'N', stopType: 'dropoff' },
                { orderId: 'F', stopType: 'dropoff' },
            ],
        });
        const out = planArrivalStops([near, far], { x: 127.380, y: 37.300 });
        expect(out[0].orderId).toBe('N');   // 코앞 하차지가 이긴다
    });

    it('제 짐을 싣기 전에는 못 내린다 — 버팀이 이 규칙을 넘지 않는다', () => {
        const c = call('C', {
            sectionDriveMin: [10, 20],
            sectionStops: [                                            // 직전 순서가 뒤집혀 있어도
                { orderId: 'C', stopType: 'dropoff' },
                { orderId: 'C', stopType: 'pickup' },
            ],
        });
        expect(name(planArrivalStops([c], { x: 127.38, y: 37.29 }))).toBe('C상 C하');
    });
});
