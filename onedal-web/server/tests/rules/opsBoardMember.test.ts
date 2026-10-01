// @ts-nocheck
import db from '../../src/db';
import opsRouter from '../../src/routes/ops';
import simRouter from '../../src/routes/sim';
import { getUserSession, peekUserSession, clearUserSession } from '../../src/state/userSessionStore';
import { recentNewWords } from '../../src/services/screenWords';

/**
 * 🧑‍✈️ **회원 상세에 관제웹 현황판의 기사 몫 셋** (기사님 «회원 페이지로 들어가면 다 있어야» · onedal-69 «가» · 모양은 onedal-ea).
 *    GET /api/ops/board/member — 📍 내 위치(관제웹과 같은 driverLocationOf) · ⚖️ 심사 중(같은 술어 judgingCallOf · 같은 동기화 buildOrderSync)
 *    · 📰 새 글자(같은 함수 recentNewWords · 모든 폰 공통). 읽기만 · 세션은 peek 만 · 열람 기록 «현황판 봄» · 좌표가 있어 «위치 봄»(둘 다 60초 묶기).
 */
const A = 'test-bm-admin', M = 'test-bm-member', N = 'test-bm-nosession';
const io = { to: () => ({ emit: () => {} }), in: () => ({ disconnectSockets: () => {} }), of: () => ({ sockets: new Map(), to: () => ({ emit: () => {} }) }) };
const app = { get: (k: string) => (k === 'io' ? io : undefined) };
const get = async (router: any, path: string, query: any) => {
    const layer = router.stack.find((l: any) => l.route?.path === path && l.route.methods.get);
    let out: any;
    const res = { status: () => res, json: (b: any) => { out = b; return res; } };
    await layer.route.stack[layer.route.stack.length - 1].handle({ app, params: {}, query, body: {}, user: { id: A }, headers: {} }, res);
    return out;
};
const views = (action: string) => db.prepare(`SELECT COUNT(*) n FROM ops_audit WHERE admin_id = ? AND action = ?`).get(A, action).n;

beforeAll(() => {
    for (const id of [A, M, N]) db.prepare(`INSERT OR IGNORE INTO users (id, google_id, email, name) VALUES (?, ?, ?, ?)`).run(id, `g-${id}`, `${id}@test`, id);
    db.prepare(`UPDATE users SET approved_at = datetime('now'), ops_allowed_at = datetime('now') WHERE id = ?`).run(A);
    clearUserSession(N);
});
afterAll(() => {
    db.prepare(`DELETE FROM ops_audit WHERE admin_id = ?`).run(A);
    for (const id of [A, M, N]) { db.prepare(`DELETE FROM user_settings WHERE user_id = ?`).run(id); db.prepare(`DELETE FROM users WHERE id = ?`).run(id); clearUserSession(id); }
});

describe('🧑‍✈️ 회원 상세 — 관제웹 현황판 기사 몫', () => {
    it('🔴 세션 없는 회원: 위치 · 심사 중 null · 세션 안 생김 · 새 글자는 공통 함수 그대로', async () => {
        const out = await get(opsRouter, '/board/member', { memberId: N });
        expect(out.location).toBeNull();
        expect(out.judging).toBeNull();
        expect(out.newWords).toEqual(recentNewWords(7));
        expect(peekUserSession(N)).toBeUndefined();
    });
    it('🔴 내 위치 = 관제웹이 읽는 sim 문과 같은 값(같은 함수) · 시 · 구 · ISO 시각', async () => {
        const s = getUserSession(M);
        s.lastFix = { x: 126.896, y: 37.517 }; s.lastFixSource = 'gps'; s.lastFixIsMock = false; s.lastFixAt = Date.now();
        const out = await get(opsRouter, '/board/member', { memberId: M });
        expect(out.location).toMatchObject({ lng: 126.896, lat: 37.517, source: 'gps', isFallback: false, region: expect.stringContaining('영등포') });
        expect(out.location.at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
        clearUserSession(N);
        const sim = await get(simRouter, '/driver-location', {});
        if (sim?.ok) expect({ x: sim.x, y: sim.y, source: sim.source, isFallback: sim.isFallback }).toEqual({ x: out.location.lng, y: out.location.lat, source: out.location.source, isFallback: out.location.isFallback });
    });
    it('🔴 심사 중 — 판정 중인 콜과 그 판정(색 · 점수 · 막은 문 · 축)', async () => {
        const s = getUserSession(M);
        s.pendingOrdersData.set('o-bm-1', { id: 'o-bm-1', status: 'ORDER_SECURED_EVALUATING', pickup: '광주 경안', dropoff: '용산 한남', fare: 50000,
            judgment: { color: '꿀', score: 82, gates: [{ key: 'g', name: '문', pass: false, why: '막힘' }], axes: [{ key: 'a', name: '축', score: 70, raw: '7' }] } });
        const out = await get(opsRouter, '/board/member', { memberId: M });
        expect(out.judging).toMatchObject({ id: 'o-bm-1', pickup: '광주 경안', dropoff: '용산 한남', status: 'ORDER_SECURED_EVALUATING', isPreview: false, fare: 50000 });
        expect(out.judging.judgment).toMatchObject({ color: '꿀', score: 82, gates: [{ name: '문' }], axes: [{ name: '축' }] });
        s.pendingOrdersData.delete('o-bm-1');
    });
    it('🔴 열람 기록 «현황판 봄» · «위치 봄» — 60초 안 다시 읽으면 안 늘어남', async () => {
        const b = views('현황판 봄'), l = views('위치 봄');
        await get(opsRouter, '/board/member', { memberId: M });
        await get(opsRouter, '/board/member', { memberId: M });
        expect(views('현황판 봄')).toBeLessThanOrEqual(b + 1);
        expect(views('위치 봄')).toBeLessThanOrEqual(l + 1);
        expect(views('위치 봄')).toBeGreaterThanOrEqual(1);
    });
});
