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
