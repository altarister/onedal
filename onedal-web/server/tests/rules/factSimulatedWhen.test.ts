// @ts-nocheck
import db from '../../src/db';
import detailRouter from '../../src/routes/detail';
import ordersRouter from '../../src/routes/orders';
import { activeDevices } from '../../src/state/deviceRegistry';
import { getUserSession, clearUserSession } from '../../src/state/userSessionStore';
import { approvedUser } from '../fixtures/approvedUser';

/**
 * 🐥 **체험 콜 표시는 «보고 때의 폰 모드» — 서버의 지금 답** (31 P0 · S5 · 29 N4 «지금» 칸).
 *    `/confirm` · `/detail` 이 각각 그 순간의 폰 모드로 체험 표시를 다시 정한다 — 둘 사이에 모드가 바뀌면 `/detail` 의 답이 남는다.
 *    P1 · P2 에서 «확정 누른 주체 · 계약 안 함»으로 바뀌면 이 기댓값이 바뀐다.
 *    실제 라우트를 부른다. 판정은 카카오 키를 지워 곧바로 끝나게 한다.
 * 못 잡는 것: 결재 때 체험 KEEP(SIMULATED_KEEP · simulatedByCallOnly) · 관제웹 체험 배지.
 */
const U = 'test-fact-simulated-when';
const DEV = 'dev-fact-sim';
const io = { to: () => ({ emit: () => {} }) };
const app = { get: (k: string) => (k === 'io' ? io : undefined) };
const handlerOf = (router: any, path: string) => {
    const layer = router.stack.find((l: any) => l.route?.path === path && l.route.methods.post);
    return layer.route.stack[layer.route.stack.length - 1].handle;
};
const post = async (router: any, path: string, body: any) => {
    const res: any = { status: () => res, json: () => res };
    await handlerOf(router, path)({ app, body }, res);
};
const order = (id: string) => ({ id, pickup: '경기 광주시 곤지암읍', dropoff: '경기 이천시 신둔면', fare: 38500, vehicleType: '다마스', rawText: '' });
const confirm = (id: string) => post(ordersRouter, '/confirm', { step: 'BASIC', deviceId: DEV, targetApp: 'insung', matchType: 'AUTO', order: order(id) });
const detail = (id: string) => post(detailRouter, '/', { step: 'DETAILED', deviceId: DEV, targetApp: 'insung', matchType: 'AUTO', order: order(id) });
const modeIs = (mode: string) => activeDevices.set(DEV, { deviceId: DEV, userId: U, lastSeen: Date.now(), status: 'ONLINE', mode } as any);
const simulated = (id: string) => (getUserSession(U).pendingOrdersData.get(id) as any)?.isSimulated;
let savedKey: string | undefined;

beforeAll(() => {
    savedKey = process.env.KAKAO_REST_API_KEY;
    delete process.env.KAKAO_REST_API_KEY;
    db.prepare(`INSERT OR IGNORE INTO users (id, google_id, email, name) VALUES (?, ?, ?, ?)`).run(U, `g-${U}`, `${U}@test`, U);
    approvedUser(U);
    db.prepare(`INSERT OR IGNORE INTO user_devices (user_id, device_id) VALUES (?, ?)`).run(U, DEV);
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

describe('🐥 체험 표시 — 보고 때의 폰 모드', () => {
    it('🔴 체험 폰의 확정 · 상세 보고는 체험 콜 · 상세는 콜 갈래도 SIMULATION', async () => {
        modeIs('SIMULATION');
        await confirm('sim-a');
        expect(simulated('sim-a')).toBe(true);
        await detail('sim-a');
        expect(simulated('sim-a')).toBe(true);
        expect(getUserSession(U).pendingOrdersData.get('sim-a')?.type).toBe('SIMULATION');
    });

    it('대조 — 자동 폰은 체험 콜이 아니다', async () => {
        modeIs('AUTO');
        await confirm('sim-b');
        await detail('sim-b');
        expect(simulated('sim-b')).toBe(false);
    });

    it('🔴 지금 답 — 확정 뒤 상세 전에 모드가 바뀌면 상세 때의 모드가 남는다(체험 → 자동이면 진짜 콜)', async () => {
        modeIs('SIMULATION');
        await confirm('sim-c');
        modeIs('AUTO');
        await detail('sim-c');
        expect(simulated('sim-c')).toBe(false);
    });
});
