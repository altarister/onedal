// @ts-nocheck
import db from '../../src/db';
import scrapRouter from '../../src/routes/scrap';
import { applyQuickFold } from '../../src/core/engine/OrderEvaluator';
import { touchDeviceSession } from '../../src/routes/devices';
import { getUserSession, clearUserSession } from '../../src/state/userSessionStore';

/**
 * ⏩ **빨리 접기 — 앱이 알람으로 연 🔴·벨 미만 콜은 판정 뒤 10초에 폰이 목록으로** (기사님 «가» · onedal-1f 가)).
 * 서버는 판정 끝에 foldAfterSec 과 judgeUntil(= 판정 끝 + 10초)을 싣고, 폰에는 목록 보고 응답 맨 위 foldAfter { orderId, remainSec }(서버 시계)로 알린다.
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
    await scrap({ app, ip: '1.1.1.1', headers: {}, get: () => undefined, body: { data: [], deviceId: DEV, filterVersion: '' } }, res);
    return out;
};

beforeAll(() => {
    db.prepare(`INSERT OR IGNORE INTO users (id, google_id, email, name) VALUES (?, ?, ?, ?)`).run(U, `g-${U}`, 'quickfold@test', '빨리접기검사');
    db.prepare(`INSERT OR IGNORE INTO user_devices (user_id, device_id) VALUES (?, ?)`).run(U, DEV);
});
afterAll(() => {
    db.prepare(`DELETE FROM user_devices WHERE user_id = ?`).run(U);
    db.prepare(`DELETE FROM users WHERE id = ?`).run(U);
    clearUserSession(U);
});

describe('⏩ 판정 끝에 싣기', () => {
    it('🔴 앱이 연 벨 미만 콜 → foldAfterSec 10 · judgeUntil = 판정 끝 + 10초', () => {
        const o: any = { id: 'qf-a', judgment: { score: 30, bell: false }, openedByApp: true, judgeUntil: 999 };
        expect(applyQuickFold(o, 1_000_000)).toBe(10);
        expect(o.foldAfterSec).toBe(10);
        expect(o.judgeUntil).toBe(1_010_000);
    });
    it('🔴 손으로 연 콜 · 벨 이상 콜은 그대로(judgeUntil 안 건드림)', () => {
        const hand: any = { id: 'qf-b', judgment: { score: null, bell: false }, openedByApp: false, judgeUntil: 777 };
        expect(applyQuickFold(hand, 1_000_000)).toBeNull();
        expect(hand.judgeUntil).toBe(777);
        const good: any = { id: 'qf-c', judgment: { score: 60, bell: true }, openedByApp: true, judgeUntil: 777 };
        expect(applyQuickFold(good, 1_000_000)).toBeNull();
        expect(good.judgeUntil).toBe(777);
    });
});

describe('⏩ 폰에 알리기', () => {
    it('🔴 그 기기의 심사 중 콜에 foldAfterSec 이 있으면 응답 맨 위 foldAfter { orderId, remainSec }(서버 시계)', async () => {
        const s = getUserSession(U);
        s.pendingOrdersData.set('qf-d', { id: 'qf-d', status: 'ORDER_AWAITING_DECISION', isPreview: true, foldAfterSec: 10, judgeUntil: Date.now() + 7_000 });
        s.deviceEvaluatingMap.set(DEV, 'qf-d');
        const r = await report();
        expect(r.foldAfter.orderId).toBe('qf-d');
        expect(r.foldAfter.remainSec).toBeGreaterThan(6);
        expect(r.foldAfter.remainSec).toBeLessThanOrEqual(7);
        expect(r).not.toHaveProperty('evaluatedAt');
        s.deviceEvaluatingMap.delete(DEV); s.pendingOrdersData.delete('qf-d');
    });
    it('🔴 remainSec 은 정수(올림 · 0 아래 없음) · remainMs 는 정수 — 원달앱 FoldAfter(remainSec: Int)가 소수를 받으면 응답 전체를 버린다', async () => {
        const s = getUserSession(U);
        s.pendingOrdersData.set('qf-i', { id: 'qf-i', status: 'ORDER_AWAITING_DECISION', isPreview: true, foldAfterSec: 10, judgeUntil: Date.now() + 9_450 });
        s.deviceEvaluatingMap.set(DEV, 'qf-i');
        const r = await report();
        expect(Number.isInteger(r.foldAfter.remainSec)).toBe(true);
        expect(r.foldAfter.remainSec).toBe(10);
        expect(Number.isInteger(r.foldAfter.remainMs)).toBe(true);
        expect(r.foldAfter.remainMs).toBeGreaterThan(9_000);
        expect(r.foldAfter.remainMs).toBeLessThanOrEqual(9_450);
        s.pendingOrdersData.get('qf-i').judgeUntil = Date.now() - 500;   // 막대 끝이 지났다
        const late = await report();
        expect(late.foldAfter.remainSec).toBe(0);
        expect(late.foldAfter.remainMs).toBe(0);
        s.deviceEvaluatingMap.delete(DEV); s.pendingOrdersData.delete('qf-i');
    });
    it('빨리 접기 콜이 아니면 칸이 없다', async () => {
        const s = getUserSession(U);
        s.pendingOrdersData.set('qf-e', { id: 'qf-e', status: 'ORDER_AWAITING_DECISION', isPreview: true, judgeUntil: Date.now() + 30_000 });
        s.deviceEvaluatingMap.set(DEV, 'qf-e');
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

describe('⏩ 폰에 처음 알림 로그', () => {
    it('🔴 콜마다 처음 한 번만 «⏩ [빨리 접기] 폰에 처음 알림 … 남은 N초»', async () => {
        const log = jest.spyOn(console, 'log').mockImplementation(() => {});
        const s = getUserSession(U);
        s.pendingOrdersData.set('qf-g', { id: 'qf-g', status: 'ORDER_AWAITING_DECISION', isPreview: true, foldAfterSec: 10, judgeUntil: Date.now() + 9_000 });
        s.deviceEvaluatingMap.set(DEV, 'qf-g');
        await report(); await report();
        const lines = log.mock.calls.map(c => c.join(' ')).filter(l => l.includes('폰에 처음 알림'));
        expect(lines).toHaveLength(1);
        expect(lines[0]).toMatch(/남은 \d+(\.\d)?초/);
        s.deviceEvaluatingMap.delete(DEV); s.pendingOrdersData.delete('qf-g');
        log.mockRestore();
    });
});
