/**
 * 🗄️ **base 경로 캐시 — C단계** (기사님 확정 2026-09-01)
 *
 * 기사님: *"보통 한 자리에서 합짐 하나까지 하니까 base 까지 보내는 건 이동 중 합짐이
 * 들어올 때만 하는 것이 좋겠다. 그러므로 조건은 기점이 200m 안까지만 사용."*
 *
 * base 는 «후보를 뺀 기존 콜 전부» 경로다. 후보가 연달아 뜰 때 기존 콜도 기점도 그대로면
 * 그 경로는 **같은 답**인데, 후보마다 카카오를 한 번씩 더 불렀다.
 *
 * 🔴 위험한 쪽은 «되썼는데 사실은 달랐다» 이다 — base 는 우회 비용(`timeDiffMin`)의
 *    분모라, 틀리면 **색이 틀린다**(규칙 ⑤-3 — 색이 곧 결정이다). 그래서 이 검사는
 *    «아끼는가»보다 **«안 되쓰는가»** 를 더 많이 본다.
 */
jest.mock('../../src/services/kakaoService', () => ({
    calculateDetourRoute: jest.fn(),
    calculateSoloRoute: jest.fn(),
}));
import { composeMergedRoute, clearBaseRouteCache } from '../../src/services/routeComposer';
import { calculateDetourRoute } from '../../src/services/kakaoService';

const mockedDetour = calculateDetourRoute as jest.Mock;

const BASE = { duration: 3600, distance: 40_000, approachDuration: 0, approachDistance: 0 };
const RESULT = {
    base: BASE,
    merged: { duration: 4200, distance: 47_000, approachDuration: 0, approachDistance: 0, sectionDriveMin: [10, 30] },
    timeDiffMin: 10, distDiffKm: '7.0',
};

/** 콜 두 건 — 좌표만 있으면 계획이 선다 */
const calls = () => ([
    { id: 'A', status: 'ORDER_CONFIRMED', pickupX: 127.31, pickupY: 37.36, dropoffX: 127.38, dropoffY: 37.29 },
    { id: 'B', status: 'ORDER_CONFIRMED', pickupX: 127.33, pickupY: 37.34, dropoffX: 127.40, dropoffY: 37.27 },
] as any);

const HERE = { x: 127.30, y: 37.37 };
/** 같은 자리에서 아주 조금(≈90m) 움직인 지점 */
const NUDGED = { x: 127.3010, y: 37.37 };
/** 200m 를 넘어 움직인 지점 (≈1.7km) */
const AWAY = { x: 127.32, y: 37.37 };

const compose = (driverLocation: any, extra: any = null) =>
    composeMergedRoute({ calls: calls(), extra, driverLocation, priority: 'RECOMMEND', carType: 1 } as any);

/**
 * 그 호출이 «되쓴 base» 를 들고 갔는가.
 * `calculateDetourRoute` 의 12번째 인자(`cachedBase`) — 11번째는 `basePlan` 이다.
 */
const CACHED_BASE_ARG = 11;
const usedCache = (i: number) => mockedDetour.mock.calls[i][CACHED_BASE_ARG] ?? null;

describe('base 캐시 — 같은 질문·같은 자리에서만 되쓴다', () => {
    beforeEach(() => { mockedDetour.mockReset(); mockedDetour.mockResolvedValue(RESULT); clearBaseRouteCache(); });

    it('첫 호출은 되쓸 것이 없다', async () => {
        await compose(HERE);
        expect(usedCache(0)).toBeNull();
    });

    it('🔴 같은 자리(90m)에서 다시 물으면 되쓴다 — 카카오 호출 1회를 아낀다', async () => {
        await compose(HERE);
        await compose(NUDGED);
        expect(usedCache(1)).toEqual(BASE);
    });

    it('🔴 200m 를 벗어나면 되쓰지 않는다 — 달리기 시작하면 base 가 진짜로 달라진다', async () => {
        await compose(HERE);
        await compose(AWAY);
        expect(usedCache(1)).toBeNull();
    });

    it('🔴 기존 콜이 달라지면 되쓰지 않는다 — 질문 자체가 다르다', async () => {
        await compose(HERE);
        mockedDetour.mockClear();
        await composeMergedRoute({
            calls: [calls()[0]], driverLocation: NUDGED, priority: 'RECOMMEND', carType: 1,
        } as any);
        expect(usedCache(0)).toBeNull();
    });

    it('🔴 차종·우선순위가 달라지면 되쓰지 않는다 — 다른 차는 다른 길로 간다', async () => {
        await compose(HERE);
        mockedDetour.mockClear();
        await composeMergedRoute({
            calls: calls(), driverLocation: NUDGED, priority: 'RECOMMEND', carType: 7,
        } as any);
        expect(usedCache(0)).toBeNull();
    });

    it('🔴 기점을 모르면 되쓰지 않는다 — «200m 안»을 잴 수가 없다 (규칙 ④)', async () => {
        await compose(HERE);
        mockedDetour.mockClear();
        await compose(null);
        expect(usedCache(0)).toBeNull();
    });

    it('🔴 후보(extra)가 붙어도 base 는 같다 — 후보를 뺀 경로가 base 이기 때문', async () => {
        await compose(HERE);
        const cand = { id: 'C', status: 'ORDER_EVALUATING', pickupX: 127.35, pickupY: 37.33, dropoffX: 127.42, dropoffY: 37.25 };
        await compose(NUDGED, cand);
        expect(usedCache(1)).toEqual(BASE);
    });
});
