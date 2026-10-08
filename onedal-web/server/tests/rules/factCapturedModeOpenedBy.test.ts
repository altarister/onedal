// @ts-nocheck
import db from '../../src/db';
import ordersRouter from '../../src/routes/orders';
import { OrderRepository } from '../../src/repositories/OrderRepository';
import { touchDeviceSession } from '../../src/state/deviceSessions';
import { activeDevices } from '../../src/state/deviceRegistry';
import { getUserSession, clearUserSession } from '../../src/state/userSessionStore';
import { restoredOrderFrom } from '../../src/state/sessionRestore';
import { approvedUser } from '../fixtures/approvedUser';

/**
 * 🖱️ **잡은 방식 = 그때 도는 모드 + 상세페이지로 진입시킨 주체** (29 P5-1 · 27 10줄 · 기사님 Q8 가).
 *    두 값의 원천은 원달앱이다 — 도는 모드는 원달앱 보고(effectiveMode), 진입 주체는 확정 보고(openedByApp). 서버는 옮겨 적기만.
 *    옛 capturedVia 칸 · 옛 줄은 그대로(factCapturedVia). 빈 값은 앞 값을 덮지 않는다.
 * 못 잡는 것: 모드를 바꾼 직후 1초(다음 원달앱 보고 전)는 옛 도는 모드가 적힐 수 있다.
 */
const U = 'test-fact-captured-mode';
const DEV = 'dev-fact-mode';
const quiet = { to: () => ({ emit: () => {} }) };
const app = { get: () => quiet };
const report = (effectiveMode: string) =>
    touchDeviceSession(DEV, U, 0, 'LIST', quiet, false, undefined, undefined, undefined, true, undefined, 'insung', { effectiveMode });
const confirm = async (id: string, openedByApp: unknown) => {
    const layer = (ordersRouter as any).stack.find((l: any) => l.route?.path === '/confirm' && l.route.methods.post);
    const res: any = { status: () => res, json: () => res };
    await layer.route.stack[layer.route.stack.length - 1].handle({ app, body: {
        step: 'BASIC', deviceId: DEV, targetApp: 'insung', matchType: 'MANUAL', openedByApp, isPreview: true,
        order: { id, pickup: '경기 광주시 곤지암읍', dropoff: '경기 이천시 신둔면', fare: 38500, rawText: '' },
    } }, res);
    return getUserSession(U).pendingOrdersData.get(id) as any;
};
const ledger = (id: string) => db.prepare(`SELECT capturedMode, openedBy FROM orders WHERE id = ?`).get(id) as any;

beforeAll(() => {
    db.prepare(`INSERT OR IGNORE INTO users (id, google_id, email, name) VALUES (?, ?, ?, ?)`).run(U, `g-${U}`, `${U}@test`, U);
    approvedUser(U);
    db.prepare(`INSERT OR IGNORE INTO user_devices (user_id, device_id, mode) VALUES (?, ?, 'ALARM')`).run(U, DEV);
});
beforeEach(() => clearUserSession(U));
afterAll(() => {
    clearUserSession(U);
    activeDevices.delete(DEV);
    db.prepare(`DELETE FROM orders WHERE userId = ?`).run(U);
    db.prepare(`DELETE FROM user_devices WHERE user_id = ?`).run(U);
    try { db.prepare(`DELETE FROM users WHERE id = ?`).run(U); } catch { /* 다른 표가 붙잡으면 다음 돌림이 이어 쓴다 */ }
});

describe('🖱️ 잡은 방식 — 그때 도는 모드 + 진입 주체', () => {
    it('🔴 원달앱이 보고한 도는 모드와 진입 주체(원달앱 · 기사)가 장부 줄에 남는다', async () => {
        report('ALARM');
        const a = await confirm('mode-a', true);
        expect([a.capturedMode, a.openedBy]).toEqual(['ALARM', 'APP']);
        OrderRepository.upsertOrder(a, U, 0, 0);
        expect(ledger('mode-a')).toEqual({ capturedMode: 'ALARM', openedBy: 'APP' });

        report('SIMULATION');   // 자동 + 계약 안 함의 명령 값 — 화면 이름은 표(«자동(계약 안 함)»)가 낸다
        const b = await confirm('mode-b', false);
        expect([b.capturedMode, b.openedBy]).toEqual(['SIMULATION', 'DRIVER']);
    });

    it('🔴 모르면 지어내지 않는다 — 진입 주체를 안 실은 옛 원달앱은 비움', async () => {
        report('MANUAL');
        expect((await confirm('mode-c', undefined)).openedBy).toBeNull();
    });

    it('🔴 원달앱 보고가 아직 없는 폰(세션 없음)이면 도는 모드를 지어내지 않는다', async () => {
        activeDevices.delete(DEV);
        expect((await confirm('mode-e', true)).capturedMode).toBeNull();
    });

    it('🔴 서버가 다시 떠도 장부 줄에서 두 칸을 되살린다', () => {
        const o = restoredOrderFrom({ id: 'mode-f', capturedMode: 'SIMULATION', openedBy: 'DRIVER' }, { visited: {}, judgment: null, contacts: {} }) as any;
        expect([o.capturedMode, o.openedBy]).toEqual(['SIMULATION', 'DRIVER']);
    });

    it('🔴 장부에 다시 쓸 때 빈 값은 앞 값을 덮지 않는다', async () => {
        report('ALARM');
        const o = await confirm('mode-d', true);
        OrderRepository.upsertOrder(o, U, 0, 0);
        OrderRepository.upsertOrder({ ...o, capturedMode: null, openedBy: null }, U, 0, 0);
        expect(ledger('mode-d')).toEqual({ capturedMode: 'ALARM', openedBy: 'APP' });
    });
});
