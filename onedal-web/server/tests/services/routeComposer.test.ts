import { optimizeWaypoints } from '../../src/utils/routeOptimizer';

/**
 * 🔴 2026-08-13 — **이미 상차한 콜의 상차지를 경유지에서 뺀다.**
 *
 * 기사님이 정리한 원칙: *"KEEP 은 예약이고 상차가 적재다."*
 * 짐을 실었으면 그 콜에 남은 일은 **하차뿐**인데, 예전에는 활성 콜이면 무조건
 * 상차·하차를 둘 다 경유지에 넣어 **이미 다녀온 상차지를 다시 가는 경로**가 나왔다.
 * 거리·시간이 부풀고 그 값으로 우회 예산을 재니 합짐 판정이 통째로 틀어졌다.
 *
 * `composeMergedRoute` 는 카카오 API 를 부르므로 여기서는 그 앞단
 * (경유지를 어떻게 고르고 정렬하는가)만 검사한다.
 */
const C = (x: number, y: number) => ({ x, y });

/** 프로덕션과 같은 규칙으로 경유지를 고른다 (composeMergedRoute 안의 로직과 동일) */
function pickWaypoints(calls: Array<{ status: string; p: { x: number; y: number }; d: { x: number; y: number } }>) {
    const pairs = calls.map(c => ({
        pickup: c.status === 'ORDER_PICKED_UP' ? null : c.p,
        dropoff: c.d,
    }));
    return {
        pickups: pairs.map(p => p.pickup).filter(Boolean) as Array<{ x: number; y: number }>,
        dropoffs: pairs.map(p => p.dropoff),
    };
}

describe('경유지 선정 — 이미 실은 짐은 하차만 남는다', () => {
    it('🔴 상차 완료(ORDER_PICKED_UP)한 콜의 상차지는 빠진다', () => {
        const { pickups, dropoffs } = pickWaypoints([
            { status: 'ORDER_PICKED_UP', p: C(127.0, 37.0), d: C(127.1, 37.1) },
            { status: 'ORDER_CONFIRMED', p: C(127.2, 37.2), d: C(127.3, 37.3) },
        ]);
        expect(pickups).toEqual([C(127.2, 37.2)]);   // 아직 안 실은 콜의 상차지만
        expect(dropoffs).toHaveLength(2);            // 하차는 둘 다 남는다
    });

    it('아직 안 실은 콜(ORDER_CONFIRMED)의 상차지는 남는다 — KEEP 은 예약이라 상차가 남아 있다', () => {
        const { pickups } = pickWaypoints([
            { status: 'ORDER_CONFIRMED', p: C(127.0, 37.0), d: C(127.1, 37.1) },
        ]);
        expect(pickups).toHaveLength(1);
    });

    it('짐을 다 싣고 하차만 남으면 상차지가 하나도 없다 — 그때도 경로를 만들 수 있어야 한다', () => {
        const { pickups, dropoffs } = pickWaypoints([
            { status: 'ORDER_PICKED_UP', p: C(127.0, 37.0), d: C(127.1, 37.1) },
            { status: 'ORDER_PICKED_UP', p: C(127.2, 37.2), d: C(127.3, 37.3) },
        ]);
        expect(pickups).toHaveLength(0);
        // 시작점 폴백: GPS 없고 상차지도 없으면 첫 하차지에서 시작한다 (undefined 가 흘러가면 안 된다)
        const gps: { x: number; y: number } | undefined = undefined;
        const startLoc = gps ?? pickups[0] ?? dropoffs[0];
        expect(startLoc).toEqual(C(127.1, 37.1));
        expect(() => optimizeWaypoints(startLoc, pickups, dropoffs)).not.toThrow();
    });
});

describe('optimizeWaypoints — 지금은 상차를 모두 먼저 돈다', () => {
    /**
     * ⚠️ 이건 **현재 동작을 고정하는** 테스트다. 옳다는 뜻이 아니다.
     *
     * 지금 구조는 `[...sortedPickups, ...sortedDropoffs]` 라 상·하차가 섞이지 않는다.
     * 그래서 잡은 짐이 **전부 동시에** 실린다고 봐야 하고, 기사님이 원하는
     * "관내콜 싣고 내린 뒤 복귀콜 상차" 순서를 만들 수 없다.
     * 그걸 고치는 것은 todo.md 의 ③번 (상·하차 섞기) — 그때 이 테스트가 깨지면 정상이다.
     */
    it('상차를 다 돈 뒤에 하차를 돈다 (섞이지 않는다)', () => {
        const start = C(127.0, 37.0);
        const { sortedPickups, sortedDropoffs } = optimizeWaypoints(
            start,
            [C(127.01, 37.0), C(127.5, 37.5)],
            [C(127.02, 37.0), C(127.6, 37.6)],
        );
        expect(sortedPickups).toHaveLength(2);
        expect(sortedDropoffs).toHaveLength(2);
        // 가까운 상차지부터
        expect(sortedPickups[0]).toEqual(C(127.01, 37.0));
    });
});
