// @ts-nocheck
import db from '../../src/db';
import opsRouter, { homeOf } from '../../src/routes/ops';
import { birthFirstStep } from '../../src/services/stepSeeder';
import { saveCargoReport } from '../../src/services/cargoReport';
import { clearUserSession } from '../../src/state/userSessionStore';

/**
 * 📞 **통화 도우미 순서 — 가장 급한 콜이 맨 위** (reviews/33 · onedal-69 «가»).
 *    통화 필요(🟡 · 상차 통화 전)가 먼저, 그 안에서 KEEP(capturedAt)이 오래된 순 — KEEP 직후 바로 통화.
 *    정렬은 opsCallsOf 한 곳 · 홈 «가장 오래된 KEEP»은 그 목록의 첫 줄과 같은 값(두 벌 없음).
 */
const D = 'test-order-driver', A = 'test-order-admin';
const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();
const ORDERS = [['TEST-ORD-3', 3], ['TEST-ORD-10', 10], ['TEST-ORD-1', 1], ['TEST-ORD-DONE', 20]] as const;
const io = { to: () => ({ emit: () => {} }), in: () => ({ disconnectSockets: () => {} }), of: () => ({ sockets: new Map(), to: () => ({ emit: () => {} }) }) };
const app = { get: (k: string) => (k === 'io' ? io : undefined) };
const calls = async (memberId: string | null = D) => {
    const layer = opsRouter.stack.find((l: any) => l.route?.path === '/calls' && l.route.methods.get);
    let out: any;
    const res = { status: () => res, json: (b: any) => { out = b; return res; } };
    await layer.route.stack[layer.route.stack.length - 1].handle({ app, params: {}, query: memberId ? { memberId } : {}, body: {}, user: { id: A }, headers: {} }, res);
    return out;
};

beforeAll(() => {
    for (const [id, name] of [[D, '기사'], [A, '와이프']]) db.prepare(`INSERT OR IGNORE INTO users (id, google_id, email, name) VALUES (?, ?, ?, ?)`).run(id, `g-${id}`, `${id}@test`, name);
    db.prepare(`UPDATE users SET approved_at = datetime('now'), ops_allowed_at = datetime('now') WHERE id = ?`).run(A);
    db.prepare(`UPDATE users SET approved_at = datetime('now') WHERE id = ?`).run(D);
    for (const [id, min] of ORDERS) {
        db.prepare(`DELETE FROM orders WHERE id = ?`).run(id);
        db.prepare(`INSERT INTO orders (id, userId, status, timestamp, capturedAt, pickup, dropoff, fare, vehicleType) VALUES (?, ?, 'ORDER_CONFIRMED', ?, ?, '경기 광주시 경안동', '경기 파주시 금촌동', 30000, '1t')`)
            .run(id, D, new Date().toISOString(), ago(min));
        birthFirstStep(D, id);
        db.prepare(`INSERT OR REPLACE INTO order_judgments (orderId, userId, color, score, detail, judgedAt) VALUES (?, ?, '똥', 30, '{}', ?)`).run(id, D, new Date().toISOString());
    }
    saveCargoReport(D, 'TEST-ORD-DONE', { stopType: 'pickup', kind: 'DECLARED', unit: '라면박스', quantity: 2 }, D, io);   // 통화 끝 — 통화 필요 아님
});
afterAll(() => {
    for (const [id] of ORDERS) { db.prepare(`DELETE FROM order_judgments WHERE orderId = ?`).run(id); db.prepare(`DELETE FROM orders WHERE id = ?`).run(id); }
    for (const id of [D, A]) { db.prepare(`DELETE FROM users WHERE id = ?`).run(id); clearUserSession(id); }
});

describe('📞 통화 도우미 순서', () => {
    it('🔴 통화 필요 먼저 · 그 안에서 KEEP 이 오래된 순 · 끝난 통화는 뒤', async () => {
        const out = await calls();
        expect(out.map((c: any) => c.id)).toEqual(['TEST-ORD-10', 'TEST-ORD-3', 'TEST-ORD-1', 'TEST-ORD-DONE']);
    });
    it('🔴 홈 «가장 오래된 KEEP» = 통화 도우미 첫 줄의 KEEP 시각', async () => {
        const out = await calls(null);   // 홈은 회원 전부를 본다
        expect(homeOf(io).todo.oldestKeepAt).toBe(out[0].capturedAt);
    });
});
