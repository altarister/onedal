// @ts-nocheck
import db from '../../src/db';
import emergencyRouter from '../../src/routes/emergency';
import { getUserSession, clearUserSession } from '../../src/state/userSessionStore';
import * as cancelCount from '../../src/core/cancelCount';

/**
 * ⏱️ **KEEP 한 콜을 원달앱이 결재를 못 받아 취소했다 — 안전취소로 남기고 경보에 알린다** (40 S2-1 · 23 S2 · 71 «가»).
 *
 * 블루투스 · 원달앱 인터넷이 다 끊긴 채 KEEP 하면, 원달앱은 30초에 «취소»를 누르고 «자동 취소 · 눌렀음»을 인터넷이 돌아온 뒤 보낸다.
 * 서버는 그 전에 시한 끝 KEEP 방어로 결재 줄을 지우고 콜을 운행에 남긴다 — 그래서 가르는 사실은 결재 줄이 아니라
 * «서버가 이 콜을 KEEP 해 운행 · 예약에 올려 두었나»(status ORDER_CONFIRMED) 하나다.
 * 지금까지는 까닭과 상관없이 «방출(사무실)»로 적어 기사님이 무슨 일인지 몰랐다.
 */
const U = 'test-emg-keeplost', DEV = 'dev-emg-keeplost';
const events: { ev: string; body: any }[] = [];
const io = { to: () => ({ emit: (ev: string, body: any) => { events.push({ ev, body }); } }) } as any;
const nowIso = () => new Date().toISOString();

async function report(orderId: string, reason: string, cancelPressed?: boolean) {
    const layer: any = (emergencyRouter as any).stack.find((l: any) => l.route?.path === '/' && l.route.methods.post);
    const req: any = { body: { deviceId: DEV, orderId, reason, screenContext: 'LIST', screenText: '', timestamp: nowIso(), ...(cancelPressed === undefined ? {} : { cancelPressed }) }, headers: {}, app: { get: () => io } };
    const out: any = { code: 200 };
    const res: any = { status(c: number) { out.code = c; return res; }, json(b: any) { out.body = b; return res; } };
    await layer.route.stack[0].handle(req, res, () => {});
    return out;
}
const ledger = (id: string) => db.prepare(`SELECT status, terminatedAt FROM orders WHERE id = ?`).get(id) as any;
function kept(id: string, where: 'myOrders' | 'reservedOrders' = 'myOrders', withQueue = true) {
    const s = getUserSession(U);
    s[where].push({ id, status: 'ORDER_CONFIRMED', capturedDeviceId: DEV } as any);
    if (withQueue) s.pendingDecisions.set(id, { action: 'KEEP', evaluatedAt: Date.now() });
    db.prepare(`INSERT OR REPLACE INTO orders (id, type, status, userId, timestamp, capturedAt, pickup, dropoff, fare, targetApp, ackedAt)
                VALUES (?, 'NEW_ORDER', 'ORDER_CONFIRMED', ?, ?, ?, '상', '하', 30000, 'insung', ?)`).run(id, U, nowIso(), nowIso(), nowIso());
    return s;
}
const alertOf = () => events.find(e => e.ev === 'emergency-alert')?.body;
const canceledOf = () => events.find(e => e.ev === 'order-canceled')?.body;

describe('⏱️ KEEP 했는데 폰이 못 받아 취소함', () => {
    beforeAll(() => {
        db.prepare(`INSERT OR IGNORE INTO users (id, google_id, email, name) VALUES (?, ?, ?, ?)`).run(U, `g-${U}`, `${U}@t`, '기사');
        db.prepare(`UPDATE users SET approved_at = ?, paid_until = ? WHERE id = ?`).run(nowIso(), '2099-12-31', U);
        db.prepare(`INSERT OR IGNORE INTO user_devices (user_id, device_id) VALUES (?, ?)`).run(U, DEV);
    });
    beforeEach(() => { events.length = 0; clearUserSession(U); });
    afterAll(() => { db.prepare(`DELETE FROM orders WHERE userId = ?`).run(U); clearUserSession(U); });

    it('🔴 운행에 KEEP 된 콜 + 자동 취소 · 눌렀음 → 안전취소 · 경보 keepLost · 장부 취소 시각 · 취소 셈은 그대로', async () => {
        const s = kept('k-1');
        const counted = jest.spyOn(cancelCount, 'countCancel');
        await report('k-1', 'AUTO_CANCEL', true);
        expect(counted).toHaveBeenCalledTimes(1);
        counted.mockRestore();
        expect(s.myOrders.find(o => o.id === 'k-1')?.status).toBe('SAFE_CANCEL');
        expect(alertOf()?.keepLost).toBe(true);
        expect(canceledOf()?.status).toBe('SAFE_CANCEL');
        expect(ledger('k-1').status).toBe('SAFE_CANCEL');
        expect(ledger('k-1').terminatedAt).toBeTruthy();
    });

    it('🔴 결재 줄이 시한 방어로 이미 지워진 뒤 온 보고도 같다(T2 — 원달앱 인터넷이 늦게 돌아옴)', async () => {
        const s = kept('k-2', 'myOrders', false);
        await report('k-2', 'AUTO_CANCEL', true);
        expect(s.myOrders.find(o => o.id === 'k-2')?.status).toBe('SAFE_CANCEL');
        expect(alertOf()?.keepLost).toBe(true);
    });

    it('🔴 예약 보관의 KEEP 콜도 — 보관에서 꺼낸다(안 꺼내면 다음 영업일에 올라온다)', async () => {
        const s = kept('k-3', 'reservedOrders');
        await report('k-3', 'AUTO_CANCEL', true);
        expect(s.reservedOrders.some(o => o.id === 'k-3')).toBe(false);
        expect(ledger('k-3').status).toBe('SAFE_CANCEL');
        expect(alertOf()?.keepLost).toBe(true);
    });

    /* 🔁 원달앱이 «못 보냈다»고 본 보고가 실제로는 닿고 응답만 잃었으면 같은 보고가 다시 온다(재시도 · 40 S2-3 다시 보내기) */
    it('🔴 같은 보고가 두 번 와도 — 상태 SAFE_CANCEL 그대로 · 경보 한 번 · 셈 한 번', async () => {
        const s = kept('k-4');
        const counted = jest.spyOn(cancelCount, 'countCancel');
        await report('k-4', 'AUTO_CANCEL', true);
        events.length = 0;
        await report('k-4', 'AUTO_CANCEL', true);
        expect(counted).toHaveBeenCalledTimes(1);
        counted.mockRestore();
        expect(s.myOrders.find(o => o.id === 'k-4')?.status).toBe('SAFE_CANCEL');
        expect(ledger('k-4').status).toBe('SAFE_CANCEL');
        expect(events).toEqual([]);
    });

    it('대조 — KEEP 안 된(심사 중) 콜 · 다른 까닭 · 칸 없는 옛 원달앱은 지금처럼 방출 · keepLost 없음', async () => {
        const s = getUserSession(U);
        s.pendingOrdersData.set('n-1', { id: 'n-1', capturedDeviceId: DEV } as any);
        await report('n-1', 'AUTO_CANCEL', true);
        expect(alertOf()?.keepLost).toBeFalsy();
        events.length = 0;
        const t = kept('n-2');
        await report('n-2', 'APP_LEFT_DETAIL', true);
        expect(t.myOrders.find(o => o.id === 'n-2')?.status).toBe('ORDER_RELEASED_BY_OFFICE');
        expect(alertOf()?.keepLost).toBeFalsy();
        events.length = 0;
        const u = kept('n-3');
        await report('n-3', 'AUTO_CANCEL');
        expect(u.myOrders.find(o => o.id === 'n-3')?.status).toBe('ORDER_RELEASED_BY_OFFICE');
    });
});
