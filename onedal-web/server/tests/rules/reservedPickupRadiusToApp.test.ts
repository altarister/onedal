// @ts-nocheck
import db from '../../src/db';
import scrapRouter from '../../src/routes/scrap';
import { phoneSupplyOf } from '../../src/state/phoneSupply';
import { getUserSession, clearUserSession } from '../../src/state/userSessionStore';
import { approvedUser } from '../fixtures/approvedUser';

/**
 * 📅 **앱 알람 필터에 내일 콜 상차 반경(줄이지 않은 기본값)을 따로 싣는다** (기사님 «가» · onedal-1f · 앱 edde9b70 먼저).
 * 앱에는 반경이 하나뿐이라 내일 콜도 오늘 자동 반경(16.87km)으로 걸러, 상차 16.9~20km 내일 콜 셋이 «상차만 ❌»로 떨어졌다.
 * 오늘 콜은 지금처럼 자동 반경(pickupRadiusKm) · 내일 콜은 reservedPickupRadiusKm · 기본값이 비면 칸이 없다(앱은 pickupRadiusKm).
 */
const U = 'test-reserved-radius-app';
const DEV = 'dev-reserved-radius-1';
const io = { to: () => ({ emit: () => {} }) };
const app = { get: (k: string) => (k === 'io' ? io : undefined) };
const handler = (() => {
    const layer = scrapRouter.stack.find((l: any) => l.route?.path === '/' && l.route.methods.post);
    return layer.route.stack[layer.route.stack.length - 1].handle;
})();
const report = async () => {
    let out: any = null;
    const res = { status: () => res, json: (b: any) => { out = b; return res; } };
    await handler({ app, ip: '1.1.1.1', headers: {}, get: () => undefined, body: { data: [], deviceId: DEV, filterVersion: '', supplyLinked: true } }, res);
    return phoneSupplyOf(U);   // 필터는 관제앱 공급 한 길(reviews/50 ①-5) — 보고는 폰을 살아 있게만 한다
};

beforeAll(() => {
    db.prepare(`INSERT OR IGNORE INTO users (id, google_id, email, name) VALUES (?, ?, ?, ?)`).run(U, `g-${U}`, 'reservedradius@test', '내일반경검사');
    approvedUser(U);   // 🪪 폰 문은 승인 전 계정을 막는다(core/accountGate)
    db.prepare(`INSERT OR IGNORE INTO user_devices (user_id, device_id) VALUES (?, ?)`).run(U, DEV);
});
afterAll(() => {
    db.prepare(`DELETE FROM user_devices WHERE user_id = ?`).run(U);
    db.prepare(`DELETE FROM users WHERE id = ?`).run(U);
    clearUserSession(U);
});

describe('📅 앱 알람 필터 — 내일 콜 상차 반경', () => {
    it('🔴 오늘은 자동으로 줄인 반경 · 내일 콜은 줄이지 않은 기본 반경', async () => {
        const s = getUserSession(U);
        s.baseFilter = { ...s.baseFilter, pickupRadiusKm: 25 };
        s.activeFilter = { ...s.activeFilter, pickupRadiusKm: 25, radiusAuto: true, radiusDistanceKm: 33.747, radiusBaseKm: 50 };
        const r = await report();
        expect(r.filter.pickupRadiusKm).toBeCloseTo(16.87, 1);
        expect(r.filter.reservedPickupRadiusKm).toBe(25);
    });
    it('🔴 기본 반경이 바뀌면 판이 바뀐다', async () => {
        const s = getUserSession(U);
        s.baseFilter = { ...s.baseFilter, pickupRadiusKm: 25 };
        const a = await report();
        s.baseFilter = { ...s.baseFilter, pickupRadiusKm: 30 };
        const b = await report();
        expect(b.filterVersion).not.toBe(a.filterVersion);
    });
    it('🔴 기본 반경이 비면 칸이 없다 — 앱은 pickupRadiusKm 으로', async () => {
        const s = getUserSession(U);
        s.baseFilter = { ...s.baseFilter, pickupRadiusKm: undefined };
        const r = await report();
        expect(r.filter).not.toHaveProperty('reservedPickupRadiusKm');
    });
});
