// @ts-nocheck
import { calculateSoloRoute, prefetchSoloRoute, hedgeBudget } from '../../src/services/kakaoService';

/**
 * 🏃 **미리 출발한 길찾기를 받아 쓰면 로그 한 줄 · 거기서 나간 «한 번 더»도 판정 칸에 센다** (onedal-1f «가»).
 * 라이브 19:25 «길찾기 2369ms · 단독» 에 «(다시 N)»이 없었다 — 판정이 받아 쓴 미리 출발의 한 번 더는 미리 출발 칸에서 세져 안 보였다.
 */
const realFetch = global.fetch;
const route = { routes: [{ result_code: 0, summary: { duration: 1800, distance: 20000 }, sections: [{ duration: 1800, distance: 20000, roads: [] }] }] };
let navi = 0;
/** 첫 길찾기는 멈추고, 한 번 더(둘째)는 곧바로 답한다 */
const slowFirst = ((_url: string, init: any) => {
    navi++;
    if (navi === 1) return new Promise((_r, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason)));
    return Promise.resolve({ ok: true, status: 200, json: async () => route });
}) as any;

beforeAll(() => { process.env.KAKAO_REST_API_KEY = process.env.KAKAO_REST_API_KEY || 'test-key'; });
afterEach(() => { global.fetch = realFetch; });

describe('🏃 미리 출발 받음', () => {
    it('🔴 받아 쓴 미리 출발의 «한 번 더»가 판정 칸에 세지고, 받음 로그가 한 줄', async () => {
        navi = 0;
        global.fetch = slowFirst;
        const log = jest.spyOn(console, 'log').mockImplementation(() => {});
        hedgeBudget.run({ left: 2, used: 0 }, () => prefetchSoloRoute(127.31, 37.31, 127.41, 37.41, { x: 127.0, y: 37.0 }, 'RECOMMEND', 1));
        const judge = { left: 2, used: 0 };
        await hedgeBudget.run(judge, () => calculateSoloRoute(127.31, 37.31, 127.41, 37.41, { x: 127.0, y: 37.0 }, 'RECOMMEND', 1));
        expect(navi).toBe(2);                 // 판정은 새로 묻지 않았다 — 미리 출발의 첫 요청 + 한 번 더
        expect(judge.used).toBe(1);
        const line = log.mock.calls.map(c => c.join(' ')).find(l => l.includes('[미리 출발 받음]'));
        expect(line).toMatch(/출발 뒤 \d+ms · 다시 1/);
        log.mockRestore();
    }, 10_000);
});
