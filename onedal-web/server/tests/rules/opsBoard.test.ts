// @ts-nocheck
import { readFileSync } from 'fs';
import { join } from 'path';
import db from '../../src/db';
import opsRouter from '../../src/routes/ops';
import { peekUserSession, clearUserSession } from '../../src/state/userSessionStore';

/**
 * 🧰 **운영센터 현황판 서버 문 넷** (onedal-1f «가» · e7 의 화면 표 그대로) — 전부 /api/ops 아래 · 읽기만.
 * 🔴 남의 세션을 만들거나 깨우지 않는다 — 세션 없는 회원이면 DB 값만(active 필터 null).
 * 열람 기록 «현황판 봄»은 10초마다 읽혀도 «열어 둔 동안 한 줄»: 같은 관리자 · 같은 회원으로 마지막 읽기 뒤 60초 안이면 줄을 안 더한다.
 */
const A = 'test-board-admin', M = 'test-board-member', O = 'test-board-other';
const sockets = (n: number) => ({ sockets: new Map(Array.from({ length: n }, (_, i) => [String(i), {}])) });
const io = { in: () => ({ disconnectSockets: () => {} }), to: () => ({ emit: () => {} }), of: (ns: string) => ({ ...sockets(ns === '/ops' ? 1 : 2), to: () => ({ emit: () => {} }) }) };
const app = { get: (k: string) => (k === 'io' ? io : undefined) };
const call = async (path: string, query: any = {}) => {
    const layer = opsRouter.stack.find((l: any) => l.route?.path === path && l.route.methods.get);
    let status = 200, out: any;
    const res = { status: (s: number) => { status = s; return res; }, json: (b: any) => { out = b; return res; } };
    await layer.route.stack[layer.route.stack.length - 1].handle({ app, params: {}, query, body: {}, user: { id: A }, headers: {} }, res);
    return { status, out };
};
const boardViews = () => db.prepare(`SELECT COUNT(*) n FROM ops_audit WHERE admin_id = ? AND action = '현황판 봄'`).get(A).n;

beforeAll(() => {
    for (const id of [A, M, O]) db.prepare(`INSERT OR IGNORE INTO users (id, google_id, email, name, approved_at) VALUES (?, ?, ?, ?, datetime('now'))`).run(id, `g-${id}`, `${id}@test`, id);
    db.prepare(`UPDATE users SET ops_allowed_at = datetime('now') WHERE id = ?`).run(A);
    db.prepare(`INSERT OR IGNORE INTO user_devices (user_id, device_id, device_name) VALUES (?, 'd-board-m', '배차망 폰')`).run(M);
    db.prepare(`INSERT OR IGNORE INTO user_filters (user_id, min_fare, max_fare, is_active) VALUES (?, 25000, 900000, 1)`).run(M);
    const put = db.prepare(`INSERT INTO intel (type, pickup, dropoff, fare, timestamp, user_id, device_id, targetApp, verdict) VALUES ('NEW_ORDER', ?, ?, 10000, datetime('now'), ?, ?, 'insung', ?)`);
    put.run('상차A', '하차A', M, 'd-board-m', 'pass'); put.run('상차B', '하차B', M, 'd-board-m', 'region'); put.run('상차C', '하차C', O, 'd-board-o', 'pass');
    clearUserSession(M);
});
afterAll(() => {
    db.prepare(`DELETE FROM intel WHERE user_id IN (?, ?)`).run(M, O);
    db.prepare(`DELETE FROM ops_audit WHERE admin_id = ?`).run(A);
    db.prepare(`DELETE FROM user_devices WHERE user_id = ?`).run(M);
    db.prepare(`DELETE FROM user_filters WHERE user_id = ?`).run(M);
    db.prepare(`DELETE FROM user_settings WHERE user_id IN (?, ?, ?)`).run(A, M, O);
    for (const id of [A, M, O]) { db.prepare(`DELETE FROM users WHERE id = ?`).run(id); clearUserSession(id); }
});
afterEach(() => jest.restoreAllMocks());

describe('🧰 현황판 문 넷', () => {
    it('🔴 /board/server — 부팅 · 커밋 · DB 파일 · 소켓 수(관제웹 · 운영센터) · 마지막 폰 보고', async () => {
        const { out } = await call('/board/server');
        expect(out).toEqual(expect.objectContaining({ bootedAt: expect.any(String), commit: expect.any(String), branch: expect.any(String), committedAt: expect.any(String), dbFile: expect.any(String) }));
        expect(out.sockets).toEqual({ web: 2, ops: 1 });
        expect('lastScrapAt' in out).toBe(true);
    });
    it('🔴 /board/phones — 그 회원 폰 · memberId · 좌표 없이 hasLocation · 세션 안 만듦', async () => {
        const { out } = await call('/board/phones', { memberId: M });
        expect(out.map((p: any) => p.deviceId)).toEqual(['d-board-m']);
        expect(out[0]).toMatchObject({ memberId: M, hasLocation: false });
        expect('lat' in out[0] || 'lng' in out[0]).toBe(false);
        expect(peekUserSession(M)).toBeUndefined();
    });
    it('🔴 /board/filter — 세션 없으면 active null · base 는 DB 값 · 세션 · user_settings 안 생김', async () => {
        const { out } = await call('/board/filter', { memberId: M });
        expect(out.active).toBeNull();
        expect(out.base).toMatchObject({ minFare: 25000, maxFare: 900000, isActive: true });
        expect(peekUserSession(M)).toBeUndefined();
        expect(db.prepare(`SELECT COUNT(*) n FROM user_settings WHERE user_id = ?`).get(M).n).toBe(0);
    });
    it('🔴 /board/intel — 그 회원 줄만 · 앱 판정 그대로 · 그 회원 총수', async () => {
        const { out } = await call('/board/intel', { memberId: M, limit: '10' });
        expect(out.total).toBe(2);
        expect(out.rows.map((r: any) => r.verdict).sort()).toEqual(['pass', 'region']);
        expect(out.rows.every((r: any) => r.device_id === 'd-board-m')).toBe(true);
    });
});

describe('🧰 현황판 열람 기록 — 열어 둔 동안 한 줄', () => {
    it('🔴 10초마다 셋을 읽어도 한 줄 · 60초 넘게 안 읽다 다시 읽으면 새 줄', async () => {
        let now = Date.now() + 10 * 60_000;
        jest.spyOn(Date, 'now').mockImplementation(() => now);
        const before = boardViews();
        for (let i = 0; i < 3; i++) {
            await call('/board/phones', { memberId: M }); await call('/board/filter', { memberId: M }); await call('/board/intel', { memberId: M });
            now += 10_000;
        }
        expect(boardViews()).toBe(before + 1);
        now += 61_000;
        await call('/board/phones', { memberId: M });
        expect(boardViews()).toBe(before + 2);
    });
});

describe('🧰 성적표 요약은 shared 한 벌', () => {
    it('🔴 summarizeTally 는 shared 에 · 관제웹은 그것을 가져온다', () => {
        const web = join(__dirname, '../../..');
        expect(readFileSync(join(web, 'shared/src/filterTally.ts'), 'utf8')).toMatch(/export function summarizeTally/);
        expect(readFileSync(join(web, 'client-app/src/components/dashboard/DeviceControlPanel.tsx'), 'utf8')).not.toMatch(/lib\/filterTally/);
    });
});
