// @ts-nocheck
import db from '../../src/db';
import emergencyRouter from '../../src/routes/emergency';
import { touchDeviceSession } from '../../src/state/deviceSessions';
import { getUserSession, clearUserSession } from '../../src/state/userSessionStore';
import * as cancelCount from '../../src/core/cancelCount';

/**
 * 📲 **원달앱이 확정한 콜은 원달앱이 끝까지 책임진다** (38 F36 · 기사님 정답).
 * ① 원달앱이 계약한 인성 콜의 결재를 기다리는 동안 화면이 다른 배차망 목록으로 가도, 서버는 «목록 이탈»로 치우지 않는다
 *    (원달앱이 인성으로 돌아가 «취소»를 누른 뒤에 센다).
 * ② 원달앱이 «취소를 눌렀다»고 보고하면 심사 중 콜도 장부에 안전취소로 적고 한 번만 센다.
 * 못 잡는 것: /detail 의 시한 기다림 배선(30초 · +60초) — 폰 day1 S15 · S16.
 */
const U = 'test-f36', DEV = 'dev-f36';
const quiet = { to: () => ({ emit: () => {} }) };
const nowIso = () => new Date().toISOString();

const evaluating = (id: string, targetApp: string) => {
    const s = getUserSession(U);
    s.pendingOrdersData.set(id, {
        id, status: 'ORDER_SECURED_EVALUATING', capturedDeviceId: DEV, capturedAt: nowIso(), type: 'AUTO',
        isPreview: false, detailSeen: true, pickup: '관고동', dropoff: '중리동', fare: 19000, targetApp,
    });
    s.deviceEvaluatingMap.set(DEV, id);
    return s;
};
const touch = (screen: string, targetApp: string, screenPage?: string) =>
    touchDeviceSession(DEV, U, 0, screen, quiet, undefined, undefined, undefined, undefined, undefined, undefined, targetApp, screenPage ? { screenPage } : undefined);

const events: { ev: string; body: any }[] = [];
const recorder = { to: () => ({ emit: (ev: string, body: any) => { events.push({ ev, body }); } }) };
async function report(orderId: string, over: any = {}) {
    const layer: any = (emergencyRouter as any).stack.find((l: any) => l.route?.path === '/' && l.route.methods.post);
    const req: any = { body: { deviceId: DEV, orderId, reason: 'AUTO_CANCEL', screenContext: 'DETAIL_CONFIRMED', screenText: '', timestamp: nowIso(), targetApp: 'insung', cancelPressed: true, ...over }, headers: {}, app: { get: () => recorder } };
    const res: any = { status() { return res; }, json() { return res; } };
    await layer.route.stack[0].handle(req, res, () => {});
}
const ledger = (id: string) => db.prepare(`SELECT status FROM orders WHERE id = ?`).get(id) as any;

beforeAll(() => {
    jest.useFakeTimers({ doNotFake: ['Date', 'nextTick', 'setImmediate', 'queueMicrotask'] });
    db.prepare(`INSERT OR IGNORE INTO users (id, google_id, email, name) VALUES (?, ?, ?, ?)`).run(U, `g-${U}`, `${U}@t`, '기사');
    db.prepare(`UPDATE users SET approved_at = ?, paid_until = ? WHERE id = ?`).run(nowIso(), '2099-12-31', U);
    db.prepare(`INSERT OR IGNORE INTO user_devices (user_id, device_id) VALUES (?, ?)`).run(U, DEV);
});
beforeEach(() => { clearUserSession(U); events.length = 0; });
afterAll(() => {
    jest.clearAllTimers(); jest.useRealTimers();
    db.prepare(`DELETE FROM orders WHERE userId = ?`).run(U);
    clearUserSession(U);
});

describe('📲 원달앱이 계약한 콜 — 다른 배차망 화면은 놓음이 아니다', () => {
    it('🔴 인성 콜 심사 중 · 화물24시 목록 보고 → 목록 이탈 유예를 안 건다 · 인성 목록이면 건다(대조)', () => {
        touch('DETAIL_PRE_CONFIRM', 'insung');
        const s = evaluating('f36-other', 'insung');
        touch('LIST', 'hwamul24');
        expect(s.entries.has('listExit_f36-other')).toBe(false);

        clearUserSession(U);
        touch('DETAIL_PRE_CONFIRM', 'insung');
        const t = evaluating('f36-same', 'insung');
        touch('LIST', 'insung');
        expect(t.entries.has('listExit_f36-same')).toBe(true);
    });
});

describe('🖐️ 화물24시 «신청» 뒤 배차내역 목록은 놓음이 아니다 (38 F42)', () => {
    it('🔴 화물24시 자동 계약 심사 중 · 배차내역 목록(내 오더) 보고 → 목록 이탈 유예를 안 건다 · 화물24시 콜 목록이면 건다(대조)', () => {
        touch('DETAIL_PRE_CONFIRM', 'hwamul24');
        const s = evaluating('f42-mine', 'hwamul24');
        touch('MY_ORDERS', 'hwamul24', '배차내역 목록');
        expect(s.entries.has('listExit_f42-mine')).toBe(false);

        clearUserSession(U);
        touch('DETAIL_PRE_CONFIRM', 'hwamul24');
        const t = evaluating('f42-list', 'hwamul24');
        touch('LIST', 'hwamul24');
        expect(t.entries.has('listExit_f42-list')).toBe(true);
    });
});

describe('📮 원달앱 «취소를 눌렀다» 보고 — 심사 중 콜도 장부에 안전취소', () => {
    it('🔴 장부 SAFE_CANCEL · 셈 한 번 · 같은 보고가 두 번 와도 한 번', async () => {
        evaluating('f36-pressed', 'insung');
        const counted = jest.spyOn(cancelCount, 'countCancel');
        await report('f36-pressed');
        await report('f36-pressed');
        expect(counted).toHaveBeenCalledTimes(1);
        counted.mockRestore();
        expect(ledger('f36-pressed')?.status).toBe('SAFE_CANCEL');
        expect(getUserSession(U).pendingOrdersData.has('f36-pressed')).toBe(false);
    });
});

describe('⚠️ 원달앱 «못 눌렀음» — 취소 결재였을 때만 «취소 못 누름» 칸을 싣는다(서버가 아는 결재로 가름)', () => {
    const alertOf = () => events.find(e => e.ev === 'emergency-alert')?.body;
    it('🔴 결재 없음(시한 끝 취소)에 못 눌렀음 → 경보에 cancelPressed false · 콜은 그대로', async () => {
        const s = evaluating('f36-notpressed', 'insung');
        s.pendingDecisions.set('f36-notpressed', { action: null, evaluatedAt: Date.now() });
        await report('f36-notpressed', { reason: 'BUTTON_NOT_FOUND', cancelPressed: false });
        expect(alertOf()?.cancelPressed).toBe(false);
        expect(s.pendingOrdersData.has('f36-notpressed')).toBe(true);
    });
    it('🔴 KEEP 결재의 «닫기»를 못 누름 → 칸을 안 싣는다(계약이 남는 것이 맞음)', async () => {
        const s = evaluating('f36-keepclose', 'insung');
        s.pendingDecisions.set('f36-keepclose', { action: 'KEEP', evaluatedAt: Date.now() });
        await report('f36-keepclose', { reason: 'BUTTON_NOT_FOUND', cancelPressed: false });
        expect(alertOf()).toBeTruthy();
        expect('cancelPressed' in alertOf()).toBe(false);
    });
});
