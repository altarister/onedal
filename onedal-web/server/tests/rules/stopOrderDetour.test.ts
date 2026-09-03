import { planArrivalStops } from '../../src/services/routeComposer';

/**
 * 🧭 **«근소»는 비율이 아니라 «몇 km 차이인가»다** (기사님 실측 2026-09-03)
 *
 * 기사님: *"경로가 좀 이상해 보이는데 … 순차적으로 가고 있는거 맞아?"*
 *
 * ── 실측 (2026-09-03 12:43 · 서진 문제지) ──
 * 서버가 짠 순서가 **②하차(가산동)를 ③상차(안양)보다 먼저** 놓았다.
 * ```
 * 기사님 순서  초월 → 성남 → 안양 → 가산동 → 구로동 → 방화동   66.2km /  99분
 * 서버 순서    초월 → 성남 → 가산동 → 안양 → 구로동 → 방화동   81.2km / 151분
 *                                                        ────────────────
 *                                                   차이  +15.0km / +52분
 * ```
 * 가산동(37.469)까지 올라갔다가 안양(37.430)으로 내려온 뒤 구로동(37.506)으로 다시 올라간다.
 *
 * ── 왜 그랬나 ──
 * `STOP_ORDER_HYSTERESIS`(직전 순서를 **1.20배 안에서 편든다**)에 걸렸다.
 * ```
 * 성남 → 안양 석수동   직선 19.2km   실제 도로 22.2km / 23분
 * 성남 → 금천 가산동   직선 21.7km   실제 도로 27.3km / 45분
 * 비율 1.13 < 1.20  →  «근소»로 판정되어 직전 순서(가산동 먼저)가 이겼다
 * ```
 *
 * 🔴 **문턱을 낮추는 것으로는 못 고친다.** #90 을 막던 안정성 검사는 비율이 **1.18**이라
 *    더 크다 — 낮추면 번호가 다시 춤춘다. 두 경우를 가르는 것은 **절대 차이**다:
 * ```
 * 안정성(편들어야 함)   2.03 vs 2.39km → 차이 0.36km
 * 이 사고(편들면 안 됨)  19.2 vs 21.7km → 차이 2.5km
 * ```
 * 그래서 «비율 안 **그리고** 절대 차이도 작을 때»만 편든다.
 */
const call = (id: string, over: object = {}) => ({
    id, status: 'ORDER_CONFIRMED',
    pickupX: 127.31, pickupY: 37.36, dropoffX: 127.38, dropoffY: 37.29,
    ...over,
}) as any;

const name = (sts: Array<{ orderId: string; stopType: string }>) =>
    sts.map(s => `${s.orderId}${s.stopType === 'pickup' ? '상' : '하'}`).join(' ');

describe('🧭 먼 거리에서는 직전 순서가 못 이긴다 (2026-09-03)', () => {
    /** 오늘 실물 좌표 — ②성남→가산동 · ③안양→구로동 */
    const grabbed = (saved?: Array<{ orderId: string; stopType: 'pickup' | 'dropoff' }>) => ([
        call('B', {                                   // ② 성남 여수동 → 금천 가산동
            arrivedPickupAt: '2026-09-03T12:35:00+09:00',   // 이미 실었다
            pickupX: 127.122541, pickupY: 37.422620,
            dropoffX: 126.883619, dropoffY: 37.468967,
            ...(saved ? { sectionDriveMin: [10, 20], sectionStops: saved } : {}),
        }),
        call('C', {                                   // ③ 안양 석수동 → 구로 구로동
            pickupX: 126.904770, pickupY: 37.429537,
            dropoffX: 126.874476, dropoffY: 37.505685,
        }),
    ]);

    /** 직전 순서는 «B하차 먼저»라고 말한다 — ②③만 있던 시절에 굳은 순서다 */
    const SAVED_B_DROP_FIRST = [
        { orderId: 'B', stopType: 'dropoff' as const },
        { orderId: 'C', stopType: 'pickup' as const },
        { orderId: 'C', stopType: 'dropoff' as const },
    ];

    /** 성남 여수동에서 물었을 때 — 안양(19.2km)이 가산동(21.7km)보다 가깝다 */
    const AT_SEONGNAM = { x: 127.122541, y: 37.422620 };

    it('🔴 2.5km 나 차이 나면 직전 순서를 안 편든다 — 되돌아가면 +15km 다', () => {
        const got = name(planArrivalStops(grabbed(SAVED_B_DROP_FIRST), AT_SEONGNAM));
        expect(got).toBe('C상 B하 C하');
    });

    it('직전 순서가 없어도 같은 답이다 — 가까운 곳부터 (안양이 먼저)', () => {
        expect(name(planArrivalStops(grabbed(), AT_SEONGNAM))).toBe('C상 B하 C하');
    });
});
