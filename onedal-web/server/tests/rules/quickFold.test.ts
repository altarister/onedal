// @ts-nocheck
import db from '../../src/db';
import scrapRouter from '../../src/routes/scrap';
import { applyQuickFold } from '../../src/core/engine/OrderEvaluator';
import { sendFold } from '../../src/state/decisions';
import { touchDeviceSession } from '../../src/routes/devices';
import { getUserSession, clearUserSession } from '../../src/state/userSessionStore';
import { approvedUser } from '../fixtures/approvedUser';

/**
 * ⏩ **빨리 접기 — 앱이 알람으로 연 🔴·벨 미만 콜은 판정 뒤 10초에 폰이 목록으로** (기사님 «가» · onedal-1f 가)).
 * 서버는 판정 끝에 foldAfterSec 과 judgeUntil(= 판정 끝 + 10초)을 싣고, 폰에는 관제앱 공급 소켓 phone-fold { orderId, remainMs }(서버 시계) → 블루투스 FOLD 로 알린다.
 * 서버는 시간으로 미리보기를 끄지 않는다(기사님 옛 결정) — 폰이 돌아가면 «상세 이탈» 하나로 끈다. 그때 막대 끝과 접힘 차이를 한 줄로 잰다.
 */
const U = 'test-quick-fold';
const DEV = 'dev-quick-fold-1';
const io = { to: () => ({ emit: () => {} }) };
const app = { get: (k: string) => (k === 'io' ? io : undefined) };
const scrap = (() => {
    const layer = scrapRouter.stack.find((l: any) => l.route?.path === '/' && l.route.methods.post);
    return layer.route.stack[layer.route.stack.length - 1].handle;
})();
const report = async () => {
    let out: any = null;
    const res = { status: () => res, json: (b: any) => { out = b; return res; } };
    await scrap({ app, ip: '1.1.1.1', headers: {}, get: () => undefined, body: { data: [], deviceId: DEV, filterVersion: '', supplyLinked: true } }, res);
    return out;
};

beforeAll(() => {
    db.prepare(`INSERT OR IGNORE INTO users (id, google_id, email, name) VALUES (?, ?, ?, ?)`).run(U, `g-${U}`, 'quickfold@test', '빨리접기검사');
    approvedUser(U);   // 🪪 폰 문은 승인 전 계정을 막는다(core/accountGate)
    db.prepare(`INSERT OR IGNORE INTO user_devices (user_id, device_id) VALUES (?, ?)`).run(U, DEV);
});
afterAll(() => {
    db.prepare(`DELETE FROM user_devices WHERE user_id = ?`).run(U);
    db.prepare(`DELETE FROM users WHERE id = ?`).run(U);
    clearUserSession(U);
});

describe('⏩ 판정 끝에 싣기', () => {
    it('🔴 앱이 연 벨 미만 콜 → foldAfterSec 10 · judgeUntil = 판정 끝 + 10초', () => {
        const o: any = { id: 'qf-a', isPreview: true, judgment: { score: 30, bell: false, color: '보통' }, openedByApp: true, judgeUntil: 1_030_000 };
        expect(applyQuickFold(o, 1_000_000)).toBe(10);
        expect(o.foldAfterSec).toBe(10);
        expect(o.judgeUntil).toBe(1_010_000);
    });
    it('🔴 막대 끝은 당기기만 한다 — 원래 끝이 판정 끝 + 10초보다 이르면 그대로', () => {
        const o: any = { id: 'qf-a2', isPreview: true, judgment: { score: 30, bell: false, color: '보통' }, openedByApp: true, judgeUntil: 1_005_000 };
        expect(applyQuickFold(o, 1_000_000)).toBe(10);
        expect(o.judgeUntil).toBe(1_005_000);
    });
    it('🔴 미리보기 콜에만 — 잡은 콜(안전취소 막대)은 안 접는다', () => {
        const held: any = { id: 'qf-a3', judgment: { score: 30, bell: false, color: '보통' }, openedByApp: true, judgeUntil: 1_030_000 };
        expect(applyQuickFold(held, 1_000_000)).toBeNull();
        expect(held.foldAfterSec).toBeNull();
        expect(held.judgeUntil).toBe(1_030_000);
    });
    it('🔴 꿀 콜은 벨 점수 아래여도 안 접는다 — 기사님이 벨을 꿀 경계 위로 올려도 🔵 가 접히지 않게', () => {
        const honey: any = { id: 'qf-a4', isPreview: true, judgment: { score: 75, bell: false, color: '꿀' }, openedByApp: true, judgeUntil: 1_030_000 };
        expect(applyQuickFold(honey, 1_000_000)).toBeNull();
    });
    it('🔴 손으로 연 콜 · 벨 이상 콜은 그대로(judgeUntil 안 건드림)', () => {
        const hand: any = { id: 'qf-b', isPreview: true, judgment: { score: null, bell: false }, openedByApp: false, judgeUntil: 777 };
        expect(applyQuickFold(hand, 1_000_000)).toBeNull();
        expect(hand.judgeUntil).toBe(777);
        const good: any = { id: 'qf-c', isPreview: true, judgment: { score: 60, bell: true }, openedByApp: true, judgeUntil: 777 };
        expect(applyQuickFold(good, 1_000_000)).toBeNull();
        expect(good.judgeUntil).toBe(777);
    });
});

describe('⏩ 폰에 알리기 — 관제앱 공급 소켓 phone-fold (reviews/50 ①-5 · 보고 응답엔 없다)', () => {
    const sent: any[] = [];
    const supplyIo = { of: () => ({ adapter: { rooms: new Map([[U, new Set(['관제앱'])]]) }, to: () => ({ emit: (ev: string, d: any) => sent.push([ev, d]) }) }) };
    const folds = () => sent.filter(([ev]) => ev === 'phone-fold').map(([, d]) => d);
    beforeEach(() => { sent.length = 0; });
    it('🔴 그 기기의 심사 중 콜에 foldAfterSec 이 있으면 phone-fold { deviceId, orderId, remainMs }(서버 시계)', () => {
        const s = getUserSession(U);
        s.pendingOrdersData.set('qf-d', { id: 'qf-d', status: 'ORDER_AWAITING_DECISION', isPreview: true, foldAfterSec: 10, judgeUntil: Date.now() + 7_000 });
        s.deviceEvaluatingMap.set(DEV, 'qf-d');
        sendFold(supplyIo, s, U, 'qf-d');
        expect(folds()).toHaveLength(1);
        expect(folds()[0]).toMatchObject({ deviceId: DEV, orderId: 'qf-d' });
        expect(folds()[0].remainMs).toBeGreaterThan(6_000);
        expect(folds()[0].remainMs).toBeLessThanOrEqual(7_000);
        s.deviceEvaluatingMap.delete(DEV); s.pendingOrdersData.delete('qf-d');
    });
    it('🔴 remainMs 는 정수 · 막대 끝이 지났으면 0', () => {
        const s = getUserSession(U);
        s.pendingOrdersData.set('qf-i', { id: 'qf-i', status: 'ORDER_AWAITING_DECISION', isPreview: true, foldAfterSec: 10, judgeUntil: Date.now() - 500 });
        s.deviceEvaluatingMap.set(DEV, 'qf-i');
        sendFold(supplyIo, s, U, 'qf-i');
        expect(Number.isInteger(folds()[0].remainMs)).toBe(true);
        expect(folds()[0].remainMs).toBe(0);
        s.deviceEvaluatingMap.delete(DEV); s.pendingOrdersData.delete('qf-i');
    });
    it('빨리 접기 콜이 아니면 안 보낸다 · 보고 응답에는 foldAfter 칸이 없다', async () => {
        const s = getUserSession(U);
        s.pendingOrdersData.set('qf-e', { id: 'qf-e', status: 'ORDER_AWAITING_DECISION', isPreview: true, judgeUntil: Date.now() + 30_000 });
        s.deviceEvaluatingMap.set(DEV, 'qf-e');
        sendFold(supplyIo, s, U, 'qf-e');
        expect(folds()).toHaveLength(0);
        expect(await report()).not.toHaveProperty('foldAfter');
        s.deviceEvaluatingMap.delete(DEV); s.pendingOrdersData.delete('qf-e');
    });
});

describe('⏩ 막대 끝 → 접힘 차이 로그', () => {
    it('🔴 빨리 접기 콜이 상세 이탈로 치워질 때 «⏱️ [빨리 접기] 막대 끝 → 접힘 +N ms» 한 줄', () => {
        const log = jest.spyOn(console, 'log').mockImplementation(() => {});
        const s = getUserSession(U);
        s.pendingOrdersData.set('qf-f', { id: 'qf-f', status: 'ORDER_AWAITING_DECISION', isPreview: true, detailSeen: true, foldAfterSec: 10, judgeUntil: Date.now() - 1_200 });
        s.deviceEvaluatingMap.set(DEV, 'qf-f');
        touchDeviceSession(DEV, U, 1, 'DETAIL_PRE_CONFIRM', io);
        touchDeviceSession(DEV, U, 1, 'LIST', io);
        const line = log.mock.calls.map(c => c.join(' ')).find(l => l.includes('[빨리 접기]'));
        expect(line).toMatch(/막대 끝 → 접힘 \+\d+ ms/);
        log.mockRestore();
    });
});
