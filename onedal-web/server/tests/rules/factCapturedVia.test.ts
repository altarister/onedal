// @ts-nocheck
import db from '../../src/db';
import ordersRouter from '../../src/routes/orders';
import { OrderRepository } from '../../src/repositories/OrderRepository';
import { getUserSession, clearUserSession } from '../../src/state/userSessionStore';
import { approvedUser } from '../fixtures/approvedUser';

/**
 * 🖱️ **옛 잡은 방식 칸(capturedVia) — 콜 모양에 없다 · 장부 칸은 빈 값** (번호 계획 4).
 *    원달앱이 안 보내 늘 빈 값이던 칸이다 — `/confirm` 은 보고에 그 칸이 있어도 콜에 싣지 않는다.
 *    잡은 방식은 그때 도는 모드(capturedMode) · 연 주체(openedBy)가 맡는다. 장부에 쓸 때 빈 값은 옛 줄의 값을 덮지 않는다(COALESCE).
 * 못 잡는 것: 옛 장부 줄의 값을 읽는 곳(관제웹 · 운행일지는 이 칸을 안 본다).
 */
const U = 'test-fact-captured-via';
const DEV = 'dev-fact-via';
const app = { get: () => ({ to: () => ({ emit: () => {} }) }) };
const confirm = async (id: string, capturedVia: unknown) => {
    const layer = (ordersRouter as any).stack.find((l: any) => l.route?.path === '/confirm' && l.route.methods.post);
    const res: any = { status: () => res, json: () => res };
    await layer.route.stack[layer.route.stack.length - 1].handle({ app, body: {
        step: 'BASIC', deviceId: DEV, targetApp: 'insung', matchType: 'AUTO', capturedVia,
        order: { id, pickupDetails: [{ listText: '경기 광주시 곤지암읍' }], dropoffDetails: [{ listText: '경기 이천시 신둔면' }], fare: 38500, rawText: '' },
    } }, res);
    return getUserSession(U).pendingOrdersData.get(id) as any;
};
const ledgerVia = (id: string) => (db.prepare(`SELECT capturedVia FROM orders WHERE id = ?`).get(id) as any)?.capturedVia;

beforeAll(() => {
    db.prepare(`INSERT OR IGNORE INTO users (id, google_id, email, name) VALUES (?, ?, ?, ?)`).run(U, `g-${U}`, `${U}@test`, U);
    approvedUser(U);
    db.prepare(`INSERT OR IGNORE INTO user_devices (user_id, device_id, mode) VALUES (?, ?, 'ALARM')`).run(U, DEV);
});
beforeEach(() => clearUserSession(U));
afterAll(() => {
    clearUserSession(U);
    db.prepare(`DELETE FROM orders WHERE userId = ?`).run(U);
    db.prepare(`DELETE FROM user_devices WHERE user_id = ?`).run(U);
    try { db.prepare(`DELETE FROM users WHERE id = ?`).run(U); } catch { /* 다른 표가 붙잡으면 다음 돌림이 이어 쓴다 */ }
});

describe('🖱️ 옛 잡은 방식 칸 — 콜에 안 싣는다', () => {
    it('🔴 보고에 그 칸이 있어도 콜에 없고 장부 칸은 빈 값', async () => {
        const o = await confirm('via-a', 'ALARM');
        expect(o).not.toHaveProperty('capturedVia');
        OrderRepository.upsertOrder(o, U, 0);
        expect(ledgerVia('via-a')).toBeNull();
    });

    it('🔴 장부에 다시 쓸 때 옛 줄의 값을 덮지 않는다', async () => {
        const o = await confirm('via-d', undefined);
        OrderRepository.upsertOrder(o, U, 0);
        db.prepare(`UPDATE orders SET capturedVia = 'MANUAL' WHERE id = ?`).run('via-d');
        OrderRepository.upsertOrder(o, U, 0);
        expect(ledgerVia('via-d')).toBe('MANUAL');
    });
});
