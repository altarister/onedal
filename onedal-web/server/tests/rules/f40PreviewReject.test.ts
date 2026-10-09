// @ts-nocheck
import db from '../../src/db';
import { handleDecision } from '../../src/services/dispatchEngine';
import * as cancelCount from '../../src/core/cancelCount';
import { writesLedger } from '../../src/core/cancelCount';
import { getUserSession, clearUserSession } from '../../src/state/userSessionStore';
import { approvedUser } from '../fixtures/approvedUser';

/**
 * 🧾 **«장부에 적나»는 한 곳 — 확정 전에 거절한 미리보기는 장부 · 서랍 «취소»에 안 남는다** (38 F40 · 71 «가»).
 * 화면을 떠나 치운 미리보기(forceCancelEvaluatingOrder)는 장부에 안 쓰는데, 결재석 «거절»(handleDecision)은 써서
 * 서랍 «취소» 탭에 진짜 안전취소와 같은 ❌ 로 섞이고 관제웹 취소 수(장부 SAFE_CANCEL 행 수)가 부풀었다.
 * 연습(체험) 콜은 지금처럼 서랍에 «🐥 연습 끝»으로 남는다(장부엔 없음).
 * 못 잡는 것: 관제웹 서랍이 실제로 빼서 그리나(isManual 없는 order-canceled → 진행 목록에서 지우고 장부를 다시 읽음 · useOrderEngine) — 폰 day1 S22.
 */
const U = 'test-f40', DEV = 'dev-f40';
const events: { ev: string; body: any }[] = [];
const io = { to: () => ({ emit: (ev: string, body: any) => { events.push({ ev, body }); } }), of: () => ({ to: () => ({ emit: () => {} }), adapter: { rooms: new Map() } }) };
const ledger = (id: string) => db.prepare(`SELECT status FROM orders WHERE id = ?`).get(id) as any;
const pending = (id: string, extra: any) => {
    const s = getUserSession(U);
    s.pendingOrdersData.set(id, { id, status: 'ORDER_SECURED_EVALUATING', capturedDeviceId: DEV, capturedAt: new Date().toISOString(),
        type: 'AUTO', pickup: '모다', dropoff: '신둔면', fare: 40000, targetApp: 'insung', ...extra });
    s.deviceEvaluatingMap.set(DEV, id);
    s.pendingDecisions.set(id, { action: null, evaluatedAt: Date.now() });
    return s;
};

beforeAll(() => { approvedUser(U); db.prepare(`INSERT OR IGNORE INTO user_devices (user_id, device_id) VALUES (?, ?)`).run(U, DEV); });
beforeEach(() => { clearUserSession(U); events.length = 0; });
afterAll(() => { db.prepare(`DELETE FROM orders WHERE userId = ?`).run(U); db.prepare(`DELETE FROM user_devices WHERE device_id = ?`).run(DEV); clearUserSession(U); });

describe('🧾 장부에 적나', () => {
    it('🔴 미리보기 · 연습은 안 적는다 · 진짜 콜만 적는다', () => {
        expect(writesLedger({ preview: false, simulated: false })).toBe(true);
        expect(writesLedger({ preview: true, simulated: false })).toBe(false);
        expect(writesLedger({ preview: false, simulated: true })).toBe(false);
        expect(writesLedger({ preview: true, simulated: true })).toBe(false);
    });

    it('🔴 확정 전 미리보기를 결재석에서 거절 — 장부 행 없음 · 메모리에서 지움 · 서랍에 안 남기는 신호(isManual 없음) · 셈 0', async () => {
        const s = pending('f40-pv', { isPreview: true });
        const counted = jest.spyOn(cancelCount, 'countCancel');
        await handleDecision(U, 'f40-pv', 'SAFE_CANCEL', io);
        expect(ledger('f40-pv')).toBeUndefined();
        expect(s.pendingOrdersData.has('f40-pv')).toBe(false);
        const c = events.find(e => e.ev === 'order-canceled')?.body;
        expect(c?.id).toBe('f40-pv');
        expect(c?.isManual).toBeFalsy();
        expect(counted.mock.calls.every(call => call[4] === true)).toBe(true);   // 미리보기 딱지를 넘겨 세지 않게
        counted.mockRestore();
    });

    it('대조 — 진짜(원달앱 계약) 콜 거절은 장부 SAFE_CANCEL · 서랍에 남기는 신호(isManual) · 연습 콜은 장부 없이 서랍에 남김', async () => {
        pending('f40-real', {});
        await handleDecision(U, 'f40-real', 'SAFE_CANCEL', io);
        expect(ledger('f40-real')?.status).toBe('SAFE_CANCEL');
        expect(events.find(e => e.ev === 'order-canceled' && e.body.id === 'f40-real')?.body.isManual).toBe(true);

        const s = pending('f40-sim', { isPreview: true, isSimulated: true });
        await handleDecision(U, 'f40-sim', 'SAFE_CANCEL', io);
        expect(ledger('f40-sim')).toBeUndefined();
        expect(s.pendingOrdersData.get('f40-sim')?.status).toBe('SAFE_CANCEL');   // 🐥 연습 끝 — 메모리에 남아 서랍이 그림
        expect(events.find(e => e.ev === 'order-canceled' && e.body.id === 'f40-sim')?.body.isManual).toBe(true);
    });
});
