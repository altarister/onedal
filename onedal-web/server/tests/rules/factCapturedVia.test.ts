// @ts-nocheck
import db from '../../src/db';
import ordersRouter from '../../src/routes/orders';
import { OrderRepository } from '../../src/repositories/OrderRepository';
import { getUserSession, clearUserSession } from '../../src/state/userSessionStore';
import { approvedUser } from '../fixtures/approvedUser';

/**
 * 🖱️ **잡은 방식 기록 — 원달앱이 보낸 값 그대로 · 모르면 비움** (31 P0 · S6 · 29 N2 «지금» 칸).
 *    서버는 잡은 방식을 스스로 정하지 않는다 — `/confirm` 의 capturedVia 를 허용 값(AUTO · ALARM · MANUAL)이면 싣고, 아니면 null.
 *    장부에 쓸 때 빈 값은 앞 값을 덮지 않는다(COALESCE). P5 에서 «모드 + 진입 주체»로 바뀌면 이 기댓값이 바뀐다.
 * 못 잡는 것: 원달앱이 무엇을 보내나(옛 원달앱만 보낸다 · 새 원달앱은 안 보냄 — 36 P6).
 */
const U = 'test-fact-captured-via';
const DEV = 'dev-fact-via';
const app = { get: () => ({ to: () => ({ emit: () => {} }) }) };
const confirm = async (id: string, capturedVia: unknown) => {
    const layer = (ordersRouter as any).stack.find((l: any) => l.route?.path === '/confirm' && l.route.methods.post);
    const res: any = { status: () => res, json: () => res };
    await layer.route.stack[layer.route.stack.length - 1].handle({ app, body: {
        step: 'BASIC', deviceId: DEV, targetApp: 'insung', matchType: 'AUTO', capturedVia,
        order: { id, pickup: '경기 광주시 곤지암읍', dropoff: '경기 이천시 신둔면', fare: 38500, rawText: '' },
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

describe('🖱️ 잡은 방식 — 원달앱이 보낸 값 그대로', () => {
    it('🔴 허용 값은 그대로 싣고 장부 줄에 남는다', async () => {
        const o = await confirm('via-a', 'ALARM');
        expect(o.capturedVia).toBe('ALARM');
        OrderRepository.upsertOrder(o, U, 0, 0);
        expect(ledgerVia('via-a')).toBe('ALARM');
    });

    it('🔴 모르는 값 · 없음은 지어내지 않고 비운다 — 폰 모드(알람)로 채우지 않는다', async () => {
        expect((await confirm('via-b', 'ROBOT')).capturedVia).toBeNull();
        expect((await confirm('via-c', undefined)).capturedVia).toBeNull();
    });

    it('🔴 장부에 다시 쓸 때 빈 값은 앞 값을 덮지 않는다', async () => {
        const o = await confirm('via-d', 'MANUAL');
        OrderRepository.upsertOrder(o, U, 0, 0);
        OrderRepository.upsertOrder({ ...o, capturedVia: null }, U, 0, 0);
        expect(ledgerVia('via-d')).toBe('MANUAL');
    });
});
