// @ts-nocheck
import db from '../../src/db';
import scrapRouter from '../../src/routes/scrap';
import ordersRouter from '../../src/routes/orders';
import { ensureBusinessDay } from '../../src/state/filterManager';
import { getUserSession, clearUserSession } from '../../src/state/userSessionStore';
import { callMemoryRoundOf } from '../../src/services/callMemoryRound';
import { businessDayKey } from '@onedal/shared';
import { approvedUser } from '../fixtures/approvedUser';

/**
 * 🌙 **진행 중 콜이 있으면 자정 영업일 전환을 미룬다** (서버 병목 6 · 기사님 «가» · onedal-1f «가»).
 *
 * 짐을 싣고 자정을 넘기면 전환이 출발 기록·오늘 필터를 지워 «모으는 중»으로 돌아갔다(09-29 로그).
 * 전환 전체(성과 기록 · 필터 되돌리기 · 출발 기록 · 예약 옮기기)를 한 덩어리로 미루고, 콜을 다 마친 뒤 넘어간다.
 * 폰 «본 콜» 기억 번호와 관제웹 콜 목록의 보관 가름도 같은 날(session.businessDay)을 본다.
 */
const U = 'test-day-rollover';
const DEV = 'dev-rollover-1';
const DAY = 86_400_000;
const today = businessDayKey(Date.now());
const yesterday = businessDayKey(Date.now() - DAY);
const io = { to: () => ({ emit: () => {} }) };
const app = { get: (k: string) => (k === 'io' ? io : undefined) };
const handlerOf = (router: any, method: 'get' | 'post') => {
    const layer = router.stack.find((l: any) => l.route?.path === '/' && l.route.methods[method]);
    return layer.route.stack[layer.route.stack.length - 1].handle;
};
const call = async (router: any, method: 'get' | 'post', req: any) => {
    let out: any = null;
    const res = { status: () => res, json: (b: any) => { out = b; return res; } };
    await handlerOf(router, method)({ app, ...req }, res);
    return out;
};
const active = (id: string) => ({ id, status: 'ORDER_CONFIRMED', pickup: '상', dropoff: '하', fare: 10000 }) as any;

beforeAll(() => {
    db.prepare(`INSERT OR IGNORE INTO users (id, google_id, email, name) VALUES (?, ?, ?, ?)`).run(U, `g-${U}`, 'rollover@test', '자정전환검사');
    approvedUser(U);   // 🪪 폰 문은 승인 전 계정을 막는다(core/accountGate)
    db.prepare(`INSERT OR IGNORE INTO user_devices (user_id, device_id) VALUES (?, ?)`).run(U, DEV);
});
afterAll(() => {
    db.prepare(`DELETE FROM orders WHERE userId = ?`).run(U);
    db.prepare(`DELETE FROM user_devices WHERE user_id = ?`).run(U);
    db.prepare(`DELETE FROM users WHERE id = ?`).run(U);
    clearUserSession(U);
});

describe('🌙 진행 중 콜이 있으면 미룬다', () => {
    it('🔴 진행 중 콜 1건 · 날 바뀜 → 전환 안 함(날 · 출발 기록 · 오늘 필터 그대로) · 미룸 로그 한 번', () => {
        const log = jest.spyOn(console, 'log').mockImplementation(() => {});
        const session = getUserSession(U);
        session.myOrders = [active(`${U}-a`)];
        session.businessDay = yesterday;
        session.departedAt = 12345;
        const filterBefore = session.activeFilter;
        expect(ensureBusinessDay(U, io)).toBe(false);
        expect(ensureBusinessDay(U, io)).toBe(false);
        expect(session.businessDay).toBe(yesterday);
        expect(session.departedAt).toBe(12345);
        expect(session.activeFilter).toBe(filterBefore);
        expect(log.mock.calls.filter(c => c.join(' ').includes('영업일 전환 미룸')).length).toBe(1);
        log.mockRestore();
    });

    it('🔴 콜을 다 마치면 넘어간다', () => {
        const session = getUserSession(U);
        session.myOrders = [];
        session.businessDay = yesterday;
        expect(ensureBusinessDay(U, io)).toBe(true);
        expect(session.businessDay).toBe(today);
    });
});

describe('🌙 같은 날을 본다', () => {
    it('🔴 폰 «본 콜» 기억 번호는 세션의 날을 따른다 — 미루는 동안 폰도 안 비운다', async () => {
        const session = getUserSession(U);
        session.myOrders = [active(`${U}-c`)];
        session.businessDay = yesterday;
        const r = await call(scrapRouter, 'post', { body: { data: [], deviceId: DEV } });
        expect(r.deviceControl.callMemoryRound % 1000).toBe(0);         // 운영 빌드처럼 회차가 없을 때도
        expect(Math.floor(r.deviceControl.callMemoryRound / 1000)).toBe(Math.floor(callMemoryRoundOf(yesterday, null) / 1000));
    });

    it('🔴 관제웹 콜 목록의 보관 가름도 세션의 날 — 미루는 동안 «오늘이 된 예약 콜»은 보관 쪽', async () => {
        const session = getUserSession(U);
        session.myOrders = [active(`${U}-d`)];
        session.businessDay = yesterday;
        const now = new Date().toISOString();
        db.prepare(`INSERT OR REPLACE INTO orders (id, type, status, userId, timestamp, capturedAt, pickup, dropoff, fare, targetApp, reserved, reservedDay, reservedAt, reserved_for)
            VALUES (?, 'NEW_ORDER', 'ORDER_CONFIRMED', ?, ?, ?, '상', '하', 10000, 'insung', 1, 1, '09:00', ?)`).run(`${U}-due`, U, now, now, today);
        const r = await call(ordersRouter, 'get', { user: { id: U } });
        expect(r.orders.map((o: any) => o.id)).not.toContain(`${U}-due`);
    });
});
