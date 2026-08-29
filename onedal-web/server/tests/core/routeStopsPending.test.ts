import { buildOrderSync } from '../../src/core/helpers';

/**
 * 🧭 **후보를 붙인 경로를 «확정된 경로»인 척 내보내지 않는다** (2026-08-29 실측)
 *
 * ── 실측 (2026-08-29 16:26, 기사님 폰) ──
 *
 * ```
 * 16:25:51  첫짐만        ⑴ 상차 6분  ⑵ 하차 25분
 * 16:26:06  합짐 후보 선점 — 아직 KEEP 전
 * 16:26:09  재탐색        ⑴ 상차 6분  ⑵ 하차 39분   ← 14분 늘었다
 * ```
 *
 * 경로가 나빠진 게 아니다. **합짐 후보를 붙여 다시 잰 값**이 첫짐의 것인 양 나갔다.
 * 정거장 목록에는 후보가 **없는데**(2곳), 주행분은 후보를 포함한 4구간 경로에서 왔다.
 * 기사님 눈에는 *"경로는 그대로인데 시간만 늘었다"* 로 보인다.
 *
 * ── 왜 막던 것이 뚫렸나 ──
 *
 * 예전에는 «구간 수 ≠ 정거장 수» 면 주행분을 전부 버렸다 — 그 길이 검사가 이걸 막았다.
 * 2026-08-21 에 **이름으로 맞추는 방식**(`orderId|stopType`)으로 바꾸면서
 * 도착할 때마다 주행분이 죽던 문제는 고쳤지만, **4구간 경로가 2정거장 질문에
 * 그대로 답하게** 됐다. 고침이 보호를 같이 걷어냈다.
 *
 * 🔴 이 값은 로그에만 쓰이지 않는다 — `routeStops` 는 관제웹 타임라인의 재료라
 *    도착 예상·카운트다운·버퍼가 전부 이 14분을 먹는다.
 *
 * ── 어떻게 가르나 ──
 *
 * 경로가 계산된 정거장(`sectionStops`) 중 **활성 콜이 아닌 것**이 있으면 후보가 섞인 것이다.
 * 다녀와서 빠진 정거장은 여전히 활성 콜의 것이므로 이 검사에 안 걸린다 — 둘이 구분된다.
 */

const 콜 = (id: string, over: any = {}) => ({
    id, status: 'ORDER_CONFIRMED',
    pickupX: 127.3, pickupY: 37.37, dropoffX: 127.4, dropoffY: 37.3,
    ...over,
});

/** 첫짐 하나 + 그 콜에 실린 «합짐 후보 포함» 4구간 경로 */
const 후보섞인세션 = () => {
    const 첫짐 = 콜('bc4682', {
        sectionStops: [
            { orderId: 'bc4682', stopType: 'pickup' },
            { orderId: '5934fa', stopType: 'pickup' },     // ← 후보. 활성 콜이 아니다
            { orderId: '5934fa', stopType: 'dropoff' },
            { orderId: 'bc4682', stopType: 'dropoff' },
        ],
        sectionDriveMin: [6, 12, 26, 39],
        routeComputedAt: '2026-08-29T07:26:09.000Z',
    });
    return { userId: 'u1', myOrders: [첫짐], pendingOrdersData: new Map([['bc4682', 첫짐]]) } as any;
};

describe('🧭 후보가 섞인 경로의 주행분', () => {
    it('🔴 첫짐 하차에 39분(후보 포함 값)을 붙이지 않는다', () => {
        const { routeStops } = buildOrderSync(후보섞인세션());
        const 하차 = routeStops.find(s => s.orderId === 'bc4682' && s.stopType === 'dropoff');
        expect(하차).toBeDefined();
        expect(하차!.driveMinutes).not.toBe(39);
    });

    it('덮이기 전 경로가 없으면 모른다고 한다 — 지어내지 않는다 (규칙 ④)', () => {
        const { routeStops } = buildOrderSync(후보섞인세션());
        expect(routeStops.every(s => s.driveMinutes === null)).toBe(true);
    });

    /**
     * ↩️ **아는 값이 있으면 모른다고 하지 않는다.** 재탐색이 후보를 붙이며 홀더를 덮을 때
     *    **덮기 직전 모습**을 한 벌 떠 둔다(후보가 취소되면 되살리려고 만든 것).
     *    확정된 경로의 주행분이 거기 그대로 있으므로 심사 30초 동안 화면이 안 깜깜해진다.
     */
    it('🔴 덮이기 전 경로가 있으면 그 값을 쓴다 — 첫짐 하차는 25분이다', () => {
        const s = 후보섞인세션();
        s.routeSnapshot = {
            orderId: 'bc4682',
            sectionStops: [
                { orderId: 'bc4682', stopType: 'pickup' },
                { orderId: 'bc4682', stopType: 'dropoff' },
            ],
            sectionDriveMin: [6, 25],
            at: null,
        };
        const 하차 = buildOrderSync(s).routeStops.find(x => x.stopType === 'dropoff');
        expect(하차!.driveMinutes).toBe(25);      // 39 가 아니다
    });

    it('덮이기 전 경로에도 확정 안 된 콜이 있으면 안 쓴다', () => {
        const s = 후보섞인세션();
        s.routeSnapshot = {
            orderId: 'bc4682',
            sectionStops: [{ orderId: '없는콜', stopType: 'pickup' }],
            sectionDriveMin: [9],
            at: null,
        };
        expect(buildOrderSync(s).routeStops.every(x => x.driveMinutes === null)).toBe(true);
    });

    it('정거장 목록 자체는 그대로다 — 후보는 원래 안 들어간다', () => {
        const { routeStops } = buildOrderSync(후보섞인세션());
        expect(routeStops.map(s => s.orderId)).toEqual(['bc4682', 'bc4682']);
    });

    /**
     * ⚠️ **다녀와서 빠진 정거장과 헷갈리면 안 된다.** 상차를 마치면 정거장 목록에서
     *    빠지지만 그 콜은 여전히 활성이다 — 이건 후보 섞임이 아니고, 주행분은 살아야 한다
     *    (2026-08-21 에 고친 그 문제를 되돌리면 안 된다).
     */
    it('🔴 상차를 다녀와 정거장이 줄어든 것은 후보 섞임이 아니다 — 주행분이 살아 있다', () => {
        const 첫짐 = 콜('bc4682', {
            visitedPickupAt: '2026-08-29T07:20:00.000Z',
            sectionStops: [
                { orderId: 'bc4682', stopType: 'pickup' },
                { orderId: 'bc4682', stopType: 'dropoff' },
            ],
            sectionDriveMin: [6, 25],
            routeComputedAt: '2026-08-29T07:25:48.000Z',
        });
        const s = { userId: 'u1', myOrders: [첫짐], pendingOrdersData: new Map([['bc4682', 첫짐]]) } as any;
        const 하차 = buildOrderSync(s).routeStops.find(x => x.stopType === 'dropoff');
        expect(하차!.driveMinutes).toBe(25);
    });

    it('후보가 KEEP 되면 그 값이 정상으로 쓰인다', () => {
        const 첫짐 = 콜('bc4682', {
            sectionStops: [
                { orderId: 'bc4682', stopType: 'pickup' },
                { orderId: '5934fa', stopType: 'pickup' },
                { orderId: '5934fa', stopType: 'dropoff' },
                { orderId: 'bc4682', stopType: 'dropoff' },
            ],
            sectionDriveMin: [6, 12, 26, 39],
            routeComputedAt: '2026-08-29T07:26:09.000Z',
        });
        const 합짐 = 콜('5934fa');
        const s = {
            userId: 'u1', myOrders: [첫짐, 합짐],
            pendingOrdersData: new Map<string, any>([['bc4682', 첫짐], ['5934fa', 합짐]]),
        } as any;
        const 하차 = buildOrderSync(s).routeStops.find(x => x.orderId === 'bc4682' && x.stopType === 'dropoff');
        expect(하차!.driveMinutes).toBe(39);
    });
});
