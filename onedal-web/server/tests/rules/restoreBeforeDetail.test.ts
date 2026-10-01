// @ts-nocheck
import db from '../../src/db';
import detailRouter from '../../src/routes/detail';
import * as dispatchEngine from '../../src/services/dispatchEngine';
import { bootstrapUserSession, restoreAndRecalculateSession } from '../../src/services/dispatchEngine';
import { getUserSession, clearUserSession } from '../../src/state/userSessionStore';
import { approvedUser } from '../fixtures/approvedUser';

/**
 * ⏳ **서버 재시작 직후 관제웹이 붙기 전에 /detail 이 오면 먼저 되살린다** (서버 병목 10 · 기사님 «가» · onedal-1f «가»).
 *
 * 되살리기는 관제웹 접속에서만 돌아, 그 전에 온 콜(직접 누른 콜 · 미리보기)은 잡은 콜이 빈 채 첫짐처럼 판정됐다(판정은 고정).
 * 되살리기는 두 번 돌지 않고, 도는 중에 부른 쪽은 끝날 때까지 기다린다.
 * 합짐 경로는 장부의 경로가 지금 잡은 콜 목록과 맞으면 다시 재지 않는다 — 되살리기가 판정 길에 들어오니 짧아야 한다.
 */
const U = 'test-restore-first';
const DEV = 'dev-restore-1';
const emitted: string[] = [];
const io = { to: () => ({ emit: (ev: string) => { emitted.push(ev); } }) };
const app = { get: (k: string) => (k === 'io' ? io : undefined) };
const realFetch = global.fetch;
let naviCalls = 0;
const handlerOf = (router: any) => {
    const layer = router.stack.find((l: any) => l.route?.path === '/' && l.route.methods.post);
    return layer.route.stack[layer.route.stack.length - 1].handle;
};
const todayAt = (h: number) => { const d = new Date(); d.setHours(h, 0, 0, 0); return d.toISOString(); };
/** 좌표는 places · orderStops 에 산다 — 되살리기가 거기서 읽는다 */
const placeOf = (x: number, y: number, tag: string) => {
    db.prepare(`INSERT OR IGNORE INTO places (address, x, y, addressDetail, customerName) VALUES (?, ?, ?, ?, ?)`).run(tag, x, y, tag, U);
    return (db.prepare(`SELECT id FROM places WHERE addressDetail = ? AND customerName = ?`).get(tag, U) as any).id;
};
const insertCall = (id: string, h: number, extra: Record<string, string | null> = {}) => {
    db.prepare(`INSERT OR REPLACE INTO orders (id, type, status, userId, timestamp, capturedAt, pickup, dropoff, fare, targetApp, routePolyline, sectionStops)
                VALUES (?, 'NEW_ORDER', 'ORDER_CONFIRMED', ?, ?, ?, '상', '하', 20000, 'insung', ?, ?)`)
        .run(id, U, todayAt(h), todayAt(h), extra.routePolyline ?? null, extra.sectionStops ?? null);
    const stop = db.prepare(`INSERT INTO orderStops (orderId, placeId, stopType) VALUES (?, ?, ?)`);
    stop.run(id, placeOf(127.1 + h * 0.01, 37.30, `${id}-p`), 'pickup');
    stop.run(id, placeOf(127.5 + h * 0.01, 37.20, `${id}-d`), 'dropoff');
};

beforeAll(() => {
    db.prepare(`INSERT OR IGNORE INTO users (id, google_id, email, name) VALUES (?, ?, ?, ?)`).run(U, `g-${U}`, 'restore@test', '되살리기검사');
    approvedUser(U);   // 🪪 폰 문은 승인 전 계정을 막는다(core/accountGate)
    db.prepare(`INSERT OR IGNORE INTO user_devices (user_id, device_id) VALUES (?, ?)`).run(U, DEV);
});
beforeEach(() => {
    naviCalls = 0;
    global.fetch = ((url: string) => {
        if (!String(url).includes('dapi.kakao.com')) naviCalls++;
        return Promise.resolve({ ok: true, status: 200, json: async () => ({ routes: [{ result_code: 0, summary: { duration: 1800, distance: 20000 }, sections: [] }], documents: [] }) });
    }) as any;
    db.prepare(`DELETE FROM orderStops WHERE orderId LIKE ?`).run(`${U}-%`);
    db.prepare(`DELETE FROM orders WHERE userId = ?`).run(U);
    clearUserSession(U);
});
afterAll(() => {
    global.fetch = realFetch;
    db.prepare(`DELETE FROM orderStops WHERE orderId LIKE ?`).run(`${U}-%`);
    db.prepare(`DELETE FROM orders WHERE userId = ?`).run(U);
    db.prepare(`DELETE FROM places WHERE customerName = ?`).run(U);
    db.prepare(`DELETE FROM user_devices WHERE user_id = ?`).run(U);
    db.prepare(`DELETE FROM users WHERE id = ?`).run(U);
    clearUserSession(U);
});

describe('⏳ 되살리기 먼저', () => {
    it('🔴 관제웹이 붙기 전 /detail — 판정은 되살린 잡은 콜을 본다', async () => {
        insertCall(`${U}-kept`, 9);
        let seen: string[] | null = null;
        const spy = jest.spyOn(dispatchEngine, 'evaluateNewOrder').mockImplementation(async (uid: string) => {
            seen = getUserSession(uid).myOrders.map((o: any) => o.id);
        });
        const res = { status: () => res, json: () => res };
        await handlerOf(detailRouter)({ app, body: {
            step: 'DETAILED', deviceId: DEV, targetApp: 'insung',
            order: { id: `${U}-new`, pickup: '경기 이천시', dropoff: '경기 여주시', fare: 30000, vehicleType: '다마스', rawText: '' },
        } }, res);
        expect(seen).toContain(`${U}-kept`);
        spy.mockRestore();
    });

    it('🔴 되살리기가 겹치면 한 번만 돌고, 뒤에 부른 쪽도 끝날 때까지 기다린다', async () => {
        insertCall(`${U}-k2`, 9);
        const log = jest.spyOn(console, 'log').mockImplementation(() => {});
        const first = bootstrapUserSession(U, io);
        const second = bootstrapUserSession(U, io);
        await second;
        const session = getUserSession(U);
        expect(session.isBootstrapping).toBe(false);
        expect(session.myOrders.map((o: any) => o.id)).toContain(`${U}-k2`);
        await first;
        expect(log.mock.calls.filter(c => c.join(' ').includes('[Bootstrap] 시작')).length).toBeLessThanOrEqual(1);
        log.mockRestore();
    });
});

describe('🗺️ 되살릴 때 합짐 경로 재사용', () => {
    it('🔴 장부의 경로가 지금 잡은 콜 목록(남은 정거장)과 맞으면 카카오를 다시 부르지 않는다', async () => {
        const line = JSON.stringify([{ x: 127.1, y: 37.3 }, { x: 127.5, y: 37.2 }]);
        insertCall(`${U}-m1`, 9, { routePolyline: line });
        insertCall(`${U}-m2`, 10, { routePolyline: line, sectionStops: JSON.stringify([
            { orderId: `${U}-m1`, stopType: 'pickup' }, { orderId: `${U}-m2`, stopType: 'pickup' },
            { orderId: `${U}-m1`, stopType: 'dropoff' }, { orderId: `${U}-m2`, stopType: 'dropoff' },
        ]) });
        process.env.KAKAO_REST_API_KEY = process.env.KAKAO_REST_API_KEY || 'test-key';
        await restoreAndRecalculateSession(U, io);
        expect(naviCalls).toBe(0);
    });

    it('남은 정거장이 다르면(장부 경로가 낡음) 지금처럼 카카오로 다시 잰다', async () => {
        const line = JSON.stringify([{ x: 127.1, y: 37.3 }, { x: 127.5, y: 37.2 }]);
        insertCall(`${U}-o1`, 9, { routePolyline: line });
        insertCall(`${U}-o2`, 10, { routePolyline: line, sectionStops: JSON.stringify([{ orderId: `${U}-o1`, stopType: 'dropoff' }]) });
        process.env.KAKAO_REST_API_KEY = process.env.KAKAO_REST_API_KEY || 'test-key';
        await restoreAndRecalculateSession(U, io);
        expect(naviCalls).toBeGreaterThan(0);
    });
});
