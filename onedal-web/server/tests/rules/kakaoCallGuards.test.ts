// @ts-nocheck
import db from '../../src/db';
import { handleDecision } from '../../src/services/dispatchEngine';
import { getUserSession, clearUserSession } from '../../src/state/userSessionStore';
import { kakaoJson, kakaoJsonHedged, hedgeBudget, calculateSoloRoute, calculateDetourRoute } from '../../src/services/kakaoService';

/**
 * 🚪 **끝난 콜에는 KEEP 을 싣지 않는다 · 카카오 호출은 제한 시간과 응답 상태를 본다 · 합짐 비교 경로 실패는 0 이 아니다**
 * (04 리뷰 뒤 서버 병목 조사 ①·②·③ · onedal-1f «가»).
 */
const U = 'test-kakao-guards';
const io = { to: () => ({ emit: () => {} }) } as any;
const realFetch = global.fetch;

beforeAll(() => {
    db.prepare(`INSERT OR IGNORE INTO users (id, google_id, email, name) VALUES (?, ?, ?, ?)`).run(U, `g-${U}`, 'guards@test', '카카오관문검사');
});
afterAll(() => {
    global.fetch = realFetch;
    db.prepare(`DELETE FROM orders WHERE userId = ?`).run(U);
    db.prepare(`DELETE FROM users WHERE id = ?`).run(U);
    clearUserSession(U);
});
afterEach(() => { global.fetch = realFetch; });

describe('🚪 KEEP 관문 — 끝난 콜', () => {
    it('🔴 안전취소된 콜에 KEEP 이 와도 앱에 KEEP 을 싣지 않고 잡은 콜에 넣지 않는다', async () => {
        const session = getUserSession(U);
        const id = `${U}-canceled`;
        session.pendingOrdersData.set(id, { id, status: 'SAFE_CANCEL', pickup: '상', dropoff: '하', fare: 10000, targetApp: 'insung' } as any);
        session.pendingDecisions.set(id, { action: 'PENDING', evaluatedAt: Date.now() } as any);

        const r = await handleDecision(U, id, 'ORDER_CONFIRMED', io);

        expect(r.success).toBe(false);
        expect(session.myOrders.map(o => o.id)).not.toContain(id);
        expect(session.pendingDecisions.get(id)?.action).not.toBe('KEEP');
        expect(session.pendingOrdersData.get(id)?.status).toBe('SAFE_CANCEL');
    });
});

describe('⏱️ 카카오 호출 — 제한 시간 · 응답 상태', () => {
    it('🔴 답이 없으면 제한 시간에 «응답 없음»으로 끊는다', async () => {
        global.fetch = ((_: any, init: any) => new Promise((_r, reject) => {
            init.signal.addEventListener('abort', () => reject(init.signal.reason));
        })) as any;
        await expect(kakaoJson('https://x', {}, 50, '길찾기')).rejects.toThrow('카카오 길찾기 응답 없음');
    });

    it('🔴 429 는 «HTTP 429» 로 — 길찾기도 같은 오류로 거절', async () => {
        global.fetch = (async () => ({ ok: false, status: 429, json: async () => ({}) })) as any;
        await expect(kakaoJson('https://x', {}, 1000, '길찾기')).rejects.toThrow('HTTP 429');
        process.env.KAKAO_REST_API_KEY = process.env.KAKAO_REST_API_KEY || 'test-key';
        await expect(calculateSoloRoute(127.1, 37.1, 127.2, 37.2, null)).rejects.toThrow('HTTP 429');
    });
});

describe('🧮 합짐 비교 경로(base) 실패', () => {
    it('🔴 base 에 경로가 없으면 0 으로 넘기지 않고 실패한다', async () => {
        process.env.KAKAO_REST_API_KEY = process.env.KAKAO_REST_API_KEY || 'test-key';
        global.fetch = (async (url: string, init?: any) => {
            if ((init?.method ?? 'GET') === 'POST') return { ok: true, status: 200, json: async () => ({ routes: [{ result_code: 0, summary: { duration: 3600, distance: 50000 }, sections: [] }] }) };
            return { ok: true, status: 200, json: async () => ({ routes: [] }) };
        }) as any;
        await expect(calculateDetourRoute(127.3, 37.3, 127.1, 37.1, 127.4, 37.4, [], { x: 127.0, y: 37.0 }, 'RECOMMEND', 1, null, null))
            .rejects.toThrow('합짐 비교 경로 탐색 실패');
    });
});

describe('🪞 나란히 한 번 더 — 첫 요청이 문턱 안에 안 오면 같은 요청을 하나 더 · 먼저 온 성공', () => {
    const never = (init: any) => new Promise((_r, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason)));
    const okAfter = (ms: number) => new Promise(r => setTimeout(() => r({ ok: true, status: 200, json: async () => ({ hit: true }) }), ms));

    it('🔴 첫 요청 멈춤 · 둘째가 빨리 옴 → 문턱 + 둘째 시간에 성공 · 다시 1', async () => {
        let n = 0;
        global.fetch = ((_: any, init: any) => (++n === 1 ? never(init) : okAfter(50))) as any;
        const budget = { left: 2, used: 0 };
        const t0 = Date.now();
        const j = await hedgeBudget.run(budget, () => kakaoJsonHedged('https://x', {}, 100, 1000, '길찾기'));
        expect(j).toEqual({ hit: true });
        expect(Date.now() - t0).toBeLessThan(600);
        expect(budget.used).toBe(1);
    });

    it('🔴 둘 다 멈춤 → 전체 마감에 «응답 없음»', async () => {
        global.fetch = ((_: any, init: any) => never(init)) as any;
        const budget = { left: 2, used: 0 };
        await expect(hedgeBudget.run(budget, () => kakaoJsonHedged('https://x', {}, 50, 300, '길찾기'))).rejects.toThrow('카카오 길찾기 응답 없음');
        expect(budget.used).toBe(1);
    });

    it('첫 요청이 문턱 안에 오면 추가 호출 0', async () => {
        let n = 0;
        global.fetch = (() => { n++; return okAfter(20); }) as any;
        const budget = { left: 2, used: 0 };
        await hedgeBudget.run(budget, () => kakaoJsonHedged('https://x', {}, 200, 1000, '길찾기'));
        await new Promise(r => setTimeout(r, 250));
        expect(n).toBe(1);
        expect(budget.used).toBe(0);
    });

    it('판정 한 번의 추가 호출은 상한까지만 — 상한이 다 쓰였으면 문턱이 지나도 안 보낸다', async () => {
        let n = 0;
        global.fetch = ((_: any, init: any) => { n++; return n === 1 ? never(init) : okAfter(10); }) as any;
        const budget = { left: 0, used: 2 };
        await expect(hedgeBudget.run(budget, () => kakaoJsonHedged('https://x', {}, 50, 200, '길찾기'))).rejects.toThrow('응답 없음');
        expect(n).toBe(1);
    });
});
