// @ts-nocheck
import db from '../../src/db';
import detailRouter from '../../src/routes/detail';
import ordersRouter from '../../src/routes/orders';
import { activeDevices } from '../../src/state/deviceRegistry';
import { getUserSession, clearUserSession } from '../../src/state/userSessionStore';
import { approvedUser } from '../fixtures/approvedUser';

/**
 * 🌐 **상세만 온 콜도 배차망이 콜에 남는다** (57 2단계).
 *    `/confirm` 기억이 없는 길(재시작 뒤 되살리기 · 번호 없이 온 옛 원달앱)에서 `/detail` 의 배차망은 판정에만 넘어가고
 *    콜에는 안 남아, 확정 행의 targetApp 이 빈 값이 됐다(로컬 10-22 «unknown» 픽커 콜) — 카드가 «🏢 카카오 픽커»를 못 그렸다.
 *    실제 라우트를 부른다. 판정은 카카오 키를 지워 곧바로 끝나게 한다.
 * 못 잡는 것: DB 행에 그대로 적히는지(OrderRepository — 확정 뒤) · 폰이 실제로 targetApp 을 싣는지.
 */
const U = 'test-detail-target-app';
const DEV = 'dev-detail-target-app';
const io = { to: () => ({ emit: () => {} }) };
const app = { get: (k: string) => (k === 'io' ? io : undefined) };
const handlerOf = (router: any, path: string) => {
    const layer = router.stack.find((l: any) => l.route?.path === path && l.route.methods.post);
    return layer.route.stack[layer.route.stack.length - 1].handle;
};
const ORDER = (id: string) => ({ id, type: 'MANUAL_CLICK', pickup: '경기 성남시 수정구 신촌동', dropoff: '서울 광진구 자양2동', fare: 10830, rawText: '' });
const post = async (router: any, path: string, body: any) => {
    const res: any = { status: () => res, json: () => res };
    await handlerOf(router, path)({ app, body }, res);
};
const detail = (id: string, targetApp?: string) => post(detailRouter, '/', { step: 'DETAILED', deviceId: DEV, targetApp, matchType: 'MANUAL', isPreview: true, order: ORDER(id) });
const confirm = (id: string, targetApp: string) => post(ordersRouter, '/confirm', { step: 'BASIC', deviceId: DEV, targetApp, matchType: 'MANUAL', isPreview: true, order: ORDER(id) });
let savedKey: string | undefined;

beforeAll(() => {
    savedKey = process.env.KAKAO_REST_API_KEY;
    delete process.env.KAKAO_REST_API_KEY;
    db.prepare(`INSERT OR IGNORE INTO users (id, google_id, email, name) VALUES (?, ?, ?, ?)`).run(U, `g-${U}`, `${U}@test`, U);
    approvedUser(U);
    db.prepare(`INSERT OR IGNORE INTO user_devices (user_id, device_id) VALUES (?, ?)`).run(U, DEV);
    activeDevices.set(DEV, { deviceId: DEV, userId: U, lastSeen: Date.now(), status: 'ONLINE', mode: 'ALARM', stats: { polled: 0, grabbed: 0, canceled: 0 } } as any);
});
beforeEach(() => clearUserSession(U));
afterAll(() => {
    if (savedKey !== undefined) process.env.KAKAO_REST_API_KEY = savedKey;
    activeDevices.delete(DEV);
    clearUserSession(U);
    db.prepare(`DELETE FROM orders WHERE userId = ?`).run(U);
    db.prepare(`DELETE FROM user_devices WHERE user_id = ?`).run(U);
    try { db.prepare(`DELETE FROM users WHERE id = ?`).run(U); } catch { /* 다른 표가 붙잡으면 다음 돌림이 이어 쓴다 */ }
});

describe('🌐 상세만 온 콜의 배차망', () => {
    it('🔴 /confirm 없이 /detail 만 와도 콜에 targetApp 이 남는다', async () => {
        await detail('MANUAL-detail-only', 'kakaopicker');
        expect((getUserSession(U).pendingOrdersData.get('MANUAL-detail-only') as any)?.targetApp).toBe('kakaopicker');
    });
    it('🔴 /confirm 이 기억한 배차망은 /detail 이 값 없이 와도 그대로', async () => {
        await confirm('MANUAL-remembered', 'kakaopicker');
        await detail('MANUAL-remembered');
        expect((getUserSession(U).pendingOrdersData.get('MANUAL-remembered') as any)?.targetApp).toBe('kakaopicker');
    });
    it('기억도 없고 모르는 값이면 기본 배차망(지어내지 않고 값 표준 한 벌)', async () => {
        await detail('MANUAL-detail-odd', 'nope');
        expect((getUserSession(U).pendingOrdersData.get('MANUAL-detail-odd') as any)?.targetApp).toBe('insung');
    });
});
