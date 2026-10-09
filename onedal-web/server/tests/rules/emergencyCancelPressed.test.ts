import db from '../../src/db';
import emergencyRouter from '../../src/routes/emergency';
import { getUserSession, clearUserSession } from '../../src/state/userSessionStore';
import * as cancelCount from '../../src/core/cancelCount';

/**
 * 🛑 **앱이 취소를 못 눌렀으면 계약이 남아 있다** (`routes/emergency.ts` · D1 ⑥ · 기사님 «가»).
 *    «눌렀나»(`cancelPressed`) 사실 하나로 가른다: false → 세지 않고 콜 · 결재 줄 그대로 · 관제웹 경보만 /
 *    true · 칸 없음(옛 원달앱) → 지금처럼 셈 · 방출 · 콜 취소 신호.
 */
const U = 'test-emg-pressed', DEV = 'dev-emg-pressed';
const events: string[] = [];
const io = { to: () => ({ emit: (ev: string) => { events.push(ev); } }) } as any;

async function report(orderId: string, cancelPressed?: boolean) {
    const layer: any = (emergencyRouter as any).stack.find((l: any) => l.route?.path === '/' && l.route.methods.post);
    const req: any = { body: { deviceId: DEV, orderId, reason: cancelPressed === false ? 'BUTTON_NOT_FOUND' : 'AUTO_CANCEL', screenContext: 'LIST', screenText: '', timestamp: new Date().toISOString(), ...(cancelPressed === undefined ? {} : { cancelPressed }) }, headers: {}, app: { get: () => io } };
    const out: any = { code: 200 };
    const res: any = { status(c: number) { out.code = c; return res; }, json(b: any) { out.body = b; return res; } };
    await layer.route.stack[0].handle(req, res, () => {});
    return out;
}

function seed(orderId: string) {
    const s = getUserSession(U);
    s.myOrders.push({ id: orderId, status: 'ORDER_CONFIRMED' } as any);
    s.pendingDecisions.set(orderId, { action: null, evaluatedAt: Date.now() });
    s.pendingOrdersData.set(orderId, { id: orderId, capturedDeviceId: DEV } as any);
    return s;
}

describe('비상 보고 — 눌렀나', () => {
    beforeAll(() => {
        db.prepare(`INSERT OR IGNORE INTO users (id, google_id, email, name) VALUES (?, ?, ?, ?)`).run(U, `g-${U}`, `${U}@t`, '기사');
        db.prepare(`UPDATE users SET approved_at = ?, paid_until = ? WHERE id = ?`).run(new Date().toISOString(), '2099-12-31', U);   // 가입 승인된 기사 — 계정 막힘을 지나게
        db.prepare(`INSERT OR IGNORE INTO user_devices (user_id, device_id) VALUES (?, ?)`).run(U, DEV);
    });
    beforeEach(() => { events.length = 0; clearUserSession(U); });

    it('못 눌렀으면(false) 세지 않고 콜 · 결재 줄 그대로 · 경보만', async () => {
        const s = seed('o-not');
        const counted = jest.spyOn(cancelCount, 'countCancel');
        const r = await report('o-not', false);
        expect(r.code).toBe(200);
        expect(counted).not.toHaveBeenCalled();
        counted.mockRestore();
        expect(s.myOrders.find(o => o.id === 'o-not')?.status).toBe('ORDER_CONFIRMED');
        expect(s.pendingDecisions.has('o-not')).toBe(true);
        expect(events).toEqual(['emergency-alert']);
    });

    it('대조 — 눌렀으면(true) 끝낸다(KEEP 된 콜의 자동 취소는 안전취소 · emergencyKeepLost) · 칸이 없으면(옛 원달앱) 지금처럼 방출', async () => {
        for (const [id, pressed, end] of [['o-yes', true, 'SAFE_CANCEL'], ['o-old', undefined, 'ORDER_RELEASED_BY_OFFICE']] as const) {
            events.length = 0;
            const s = seed(id);
            const r = await report(id, pressed);
            expect([id, r.code, r.body?.error]).toEqual([id, 200, undefined]);
            expect(s.myOrders.find(o => o.id === id)?.status).toBe(end);
            expect(s.pendingDecisions.has(id)).toBe(false);
            expect(events).toContain('order-canceled');
        }
    });
});
