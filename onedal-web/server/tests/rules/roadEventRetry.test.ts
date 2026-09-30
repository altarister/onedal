// @ts-nocheck
import { calculateSoloRoute, calculateDetourRoute, prefetchSoloRoute, hedgeBudget } from '../../src/services/kakaoService';
import { roadEventTagsOf } from '../../src/core/engine/OrderEvaluator';

/**
 * 🚧 **카카오가 출발·도착·경유지 주변 교통 장애(유고)로 길을 안 주면, 그때만 «주변 유고 무시»로 한 번 더** (기사님 «가» · onedal-1f).
 * 우리 쪽 측정 실패가 🔴 «잡지 마라»로 나가 좋은 콜을 놓쳤다. 평소 길찾기는 그대로(유고 반영) — 성공하는 콜의 시간은 안 바뀐다.
 * 106 은 실물 응답으로 확인 · 105·107 은 같은 꼴이라는 가정(카카오 문서 원문 미확인).
 */
const realFetch = global.fetch;
const ok = { routes: [{ result_code: 0, result_msg: '길찾기 성공', summary: { duration: 4308, distance: 40000, fare: { toll: 0 } },
    sections: [{ duration: 600, distance: 5000, roads: [] }, { duration: 3708, distance: 35000, roads: [] }] }] };
const fail = (code: number) => ({ routes: [{ result_code: code, result_msg: `유고 ${code}` }] });
const reply = (body: any) => Promise.resolve({ ok: true, status: 200, json: async () => body });
let calls: Array<{ url: string; body?: any }> = [];
/** 유고 무시(GET &roadevent=1 · POST "roadevent":1)면 성공, 아니면 code */
const kakao = (code: number) => ((url: string, init: any) => {
    const body = init?.body ? JSON.parse(init.body) : undefined;
    calls.push({ url, body });
    const ignoring = url.includes('roadevent=1') || body?.roadevent === 1;
    return reply(ignoring || code === 0 ? ok : fail(code));
}) as any;

beforeAll(() => { process.env.KAKAO_REST_API_KEY = process.env.KAKAO_REST_API_KEY || 'test-key'; });
beforeEach(() => { calls = []; });
afterEach(() => { global.fetch = realFetch; });

describe('🚧 단독 길찾기', () => {
    it('🔴 106 → «주변 유고 무시»로 한 번 더 · 값이 나오고 · «다시 1»', async () => {
        global.fetch = kakao(106);
        const budget = { left: 2, used: 0 };
        const r = await hedgeBudget.run(budget, () => calculateSoloRoute(127.01, 37.01, 127.02, 37.02, { x: 127.0, y: 37.0 }));
        expect(calls).toHaveLength(2);
        expect(calls[1].url).toContain('roadevent=1');
        expect(r.duration).toBe(4308);
        expect(r.roadEvent).toBe(106);
        expect(budget.used).toBe(1);
        expect(budget.left).toBe(2);        // 나란히 한 번 더의 몫을 먹지 않는다
    });
    it('🔴 성공(0)이면 한 번만 · 유고 표시 없음', async () => {
        global.fetch = kakao(0);
        const r = await calculateSoloRoute(127.03, 37.03, 127.04, 37.04, { x: 127.0, y: 37.0 });
        expect(calls).toHaveLength(1);
        expect(r.roadEvent ?? null).toBeNull();
    });
    it('🔴 유고가 아닌 오류(103)는 다시 안 묻는다 — 지금처럼 오류', async () => {
        global.fetch = kakao(103);
        await expect(calculateSoloRoute(127.05, 37.05, 127.06, 37.06, { x: 127.0, y: 37.0 })).rejects.toThrow();
        expect(calls).toHaveLength(1);
    });
    it('🔴 미리 출발 보관 — 우회 성공 결과가 원래 열쇠로 담겨 판정이 받아 쓴다 (실패 응답은 안 남는다)', async () => {
        global.fetch = kakao(106);
        hedgeBudget.run({ left: 2, used: 0 }, () => prefetchSoloRoute(127.07, 37.07, 127.08, 37.08, { x: 127.0, y: 37.0 }));
        const r = await calculateSoloRoute(127.07, 37.07, 127.08, 37.08, { x: 127.0, y: 37.0 });
        expect(calls).toHaveLength(2);      // 미리 출발의 첫 요청 + 한 번 더 — 판정은 새로 안 묻는다
        expect(r.roadEvent).toBe(106);
    });
});

describe('🚧 합짐 경로', () => {
    it('🔴 합짐 경로(POST)가 106 → 본문 "roadevent":1 로 한 번 더 · 결과에 유고 표시', async () => {
        global.fetch = kakao(106);
        const r = await calculateDetourRoute(127.2, 37.2, 127.1, 37.1, 127.3, 37.3, [{ x: 127.15, y: 37.15 }], { x: 127.0, y: 37.0 });
        const posts = calls.filter(c => c.body);
        expect(posts).toHaveLength(2);
        expect(posts[1].body.roadevent).toBe(1);
        expect(r.roadEvent).toBe(106);
    });
});

describe('🚧 판정 딱지', () => {
    it('🔴 어느 쪽 주변인지 기사님 말로', () => {
        expect(roadEventTagsOf(106)).toEqual(['도착 주변 교통 장애 — 무시하고 잰 길']);
        expect(roadEventTagsOf(105)).toEqual(['출발 주변 교통 장애 — 무시하고 잰 길']);
        expect(roadEventTagsOf(107)).toEqual(['경유지 주변 교통 장애 — 무시하고 잰 길']);
        expect(roadEventTagsOf(null)).toEqual([]);
    });
});
