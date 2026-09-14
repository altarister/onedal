import { planArrivalStops } from '../../src/services/routeComposer';

/**
 * 🧭 **순서는 살아 있되, 근소한 차이로는 안 뒤집힌다** (기사님 승인 2026-09-01)
 *
 * ── 실측: 서버가 스스로 두 순서를 오갔다 ──
 * 02:20 판에서 관제웹 번호가 **9번 찍히며** 두 순서를 오갔다. 서버 로그를 겹쳐 보니
 * 서버가 같은 카카오호출시점·같은 4정거장으로 2~10초마다 다른 답을 내고 있었다.
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

    /**
     * 🔄 **얼리는 것은 «보낸 순번이 다 아는 정거장」까지다 — 새 정거장이 끼면 다시 정한다.**
     *
     * ⚠️ 2026-09-01 에는 이 자리가 «직전 순서가 먼 상차지 먼저라도 코앞 하차지가 이긴다»였다
     *    (`pnpm drive` 가 잡은 «도착 하나가 안 찍힌» 사고). 그 사고의 뿌리는 «도착 감시가 순서에
     *    매였다»였고 09-12 에 거리로 풀렸다. 그래서 2026-09-14 기사님 결정으로 **보낸 순번이
     *    다 덮으면 그 순번을 따른다** (위 검사). 여기 남는 것은 «영영 얼지는 않는다» 쪽이다.
     */
    it('🔴 새 콜의 정거장이 보낸 순번에 없으면 다시 정한다 — 영영 얼지는 않는다', () => {
        const near = call('N', {                                       // 방금 KEEP — 아직 경로에 없다
            arrivedPickupAt: '2026-09-01T02:00:00+09:00',
            dropoffX: 127.402, dropoffY: 37.300,                       // 기점에서 ~2km
        });
        const far = call('F', {
            pickupX: 127.700, pickupY: 37.500, dropoffX: 127.800, dropoffY: 37.600,   // 아주 멀다
            sectionDriveMin: [10, 20],
            sectionStops: [
                { orderId: 'F', stopType: 'pickup' },                  // 보낸 순번은 F 뿐이다
                { orderId: 'F', stopType: 'dropoff' },
            ],
        });
        const out = planArrivalStops([near, far], { x: 127.380, y: 37.300 });
        expect(out[0].orderId).toBe('N');   // 순번이 모르는 정거장이 끼었으니 가까운 곳부터 다시 정한다
    });

    it('보낸 순번이 다 덮으면 코앞 하차지가 있어도 순번대로다 (2026-09-14 결정)', () => {
        const near = call('N', {
            arrivedPickupAt: '2026-09-01T02:00:00+09:00',
            dropoffX: 127.402, dropoffY: 37.300,
        });
        const far = call('F', {
            pickupX: 127.700, pickupY: 37.500, dropoffX: 127.800, dropoffY: 37.600,
            sectionDriveMin: [10, 20, 30],
            sectionStops: [
                { orderId: 'F', stopType: 'pickup' },
                { orderId: 'N', stopType: 'dropoff' },
                { orderId: 'F', stopType: 'dropoff' },
            ],
        });
        expect(name(planArrivalStops([near, far], { x: 127.380, y: 37.300 }))).toBe('F상 N하 F하');
    });

    /**
     * 🔴 **카카오에 보낸 순번이 남은 정거장을 다 덮으면 그 순번을 따른다** (기사님 결정 2026-09-14).
     *
     * 기사님: *"콜이 들어와 경로를 계산하고 그걸로 카카오에 순번까지 보냈으면 그걸로 끝일 거 같은데"*
     *
     * ── 실측 (2026-09-14 13:05:23 · 「7지점 한 바퀴」 모의 주행) ──
     * 13:05:11 에 카카오에 «신둔 하차 → 사음동 상차 → 관고동 하차 → 터미널 하차»로 보냈다.
     * 12초 뒤 신둔에 **2초 남은 자리**에서, 굽은 길 때문에 사음동(1.91km)이 신둔(2.33km)보다
     * 직선으로 가까워져 1번을 뺏었다 (비율 1.22 > 버팀 20%). **근접 예고(도착 전 통화)가
     * 사음동으로 갔고**, 주행분은 카카오 순서로 붙어 «⑷ 누적 18분»이 나왔다.
     *
     * 🔴 **09-01 에 «얼리면 도착이 빠진다»로 막았던 까닭은 이제 없다** — 09-12 에 도착·지나침이
     *    «순서가 아니라 거리»로 바뀌었다 (`arrivalByDistance.test.ts`). 순서가 실제 동선과 달라도
     *    500m 안에 들어오면 몇 번째든 찍힌다.
     */
    it('🔴 카카오에 보낸 순번이 남은 정거장을 다 덮으면 그대로 따른다 — 굽은 길에서 1번을 안 뺏긴다', () => {
        const 신둔 = call('e4118c', {                         // 첫짐 — 상차는 끝났다
            arrivedPickupAt: '2026-09-14T13:04:37+09:00',
            dropoffX: 127.383826605868, dropoffY: 37.2929022381899,
        });
        const 관고 = call('8dac1f', {                         // 합짐1 — 상차는 끝났다
            arrivedPickupAt: '2026-09-14T13:04:58+09:00',
            dropoffX: 127.429230, dropoffY: 37.285068,
        });
        const 사음 = call('a0e61f', {                         // 합짐2 — 경로를 든 콜
            pickupX: 127.416293, pickupY: 37.294522,
            dropoffX: 127.446936, dropoffY: 37.277421,
            sectionDriveMin: [18, 26, 28, 33],
            sectionStops: [
                { orderId: 'e4118c', stopType: 'dropoff' },
                { orderId: 'a0e61f', stopType: 'pickup' },
                { orderId: '8dac1f', stopType: 'dropoff' },
                { orderId: 'a0e61f', stopType: 'dropoff' },
            ],
        });
        const at1305_23 = { x: 127.4025, y: 37.3077 };        // 사음동 1.91km · 신둔 2.33km
        expect(name(planArrivalStops([신둔, 관고, 사음], at1305_23)))
            .toBe('e4118c하 a0e61f상 8dac1f하 a0e61f하');
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
