// @ts-nocheck
import db from '../../src/db';
import detailRouter from '../../src/routes/detail';
import ordersRouter from '../../src/routes/orders';
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

/**
 * 🧾 **되살린 확정 콜 목록은 장부에서 읽은 콜뿐이다** (기사님 «가»).
 *    재시작 직후 관제웹이 붙기 전에 폰이 올린 판정 중 콜은 메모리에만 있다 — 그 콜이 확정 콜 목록에 섞이면
 *    «진행 중 1건»으로 세여 국면이 GATHERING · 합짐 · 차종 좁힘이 되고, 같은 콜의 상세 보고가 자기 자신에 맞아
 *    «기존 확정 콜 재열람»(ACK)으로 끝나 판정을 못 받는다.
 */
describe('🧾 재시작 직후 판정 중 콜은 확정 콜이 아니다', () => {
    const insertReleased = (id: string, h: number) => {
        db.prepare(`INSERT OR REPLACE INTO orders (id, type, status, userId, timestamp, capturedAt, pickup, dropoff, fare, targetApp)
                    VALUES (?, 'NEW_ORDER', 'ORDER_RELEASED_BY_ME', ?, ?, ?, '상', '하', 20000, 'insung')`)
            .run(id, U, todayAt(h), todayAt(h));
    };
    const evaluating = (id: string) => ({ id, type: 'MANUAL', status: 'ORDER_SECURED_EVALUATING', pickup: '경기 광주시', dropoff: '경기 이천시',
        fare: 30000, timestamp: new Date().toISOString(), capturedAt: new Date().toISOString(), capturedDeviceId: DEV });

    it('🔴 장부에 진행 중 콜이 없으면 되살린 뒤 확정 콜 목록에 판정 중 콜이 없고 국면은 STANDBY', async () => {
        insertReleased(`${U}-rel`, 9);
        const session = getUserSession(U);
        session.pendingOrdersData.set(`${U}-eval`, evaluating(`${U}-eval`));
        const log = jest.spyOn(console, 'log').mockImplementation(() => {});
        await restoreAndRecalculateSession(U, io);
        log.mockRestore();
        expect(session.myOrders.map((o: any) => o.id)).not.toContain(`${U}-eval`);
        expect(session.activeFilter.dispatchPhase ?? 'STANDBY').toBe('STANDBY');
        expect(session.pendingOrdersData.has(`${U}-eval`)).toBe(true);
    });

    it('🔴 관제웹이 붙기 전 그 콜의 상세 보고 — 재열람(ACK)으로 끝나지 않고 판정을 받는다', async () => {
        insertReleased(`${U}-rel2`, 9);
        getUserSession(U).pendingOrdersData.set(`${U}-eval2`, evaluating(`${U}-eval2`));
        let evaluated = false;
        const spy = jest.spyOn(dispatchEngine, 'evaluateNewOrder').mockImplementation(async () => { evaluated = true; });
        let body: any = null;
        const res = { status: () => res, json: (b: any) => { body = b; return res; } };
        await handlerOf(detailRouter)({ app, body: {
            step: 'DETAILED', deviceId: DEV, targetApp: 'insung',
            order: { id: `${U}-eval2`, pickup: '경기 광주시', dropoff: '경기 이천시', fare: 30000, vehicleType: '다마스', rawText: '' },
        } }, res);
        spy.mockRestore();
        /* 재열람은 «진짜 ID»(orderId)를 실은 ACK 로 끝난다 — 보통 판정 길의 ACK 에는 orderId 가 없다 */
        expect(body?.orderId).toBeUndefined();
        expect(evaluated).toBe(true);
    });
});

/**
 * 📞 **재시작 뒤에도 진행 중 콜의 상하차지 전화번호가 관제웹 단계 시트에 있다** (관제 «가»).
 *    단계 시트의 📞 은 콜의 `pickupDetails` · `dropoffDetails` 를 읽는다. 관제웹은 이력(GET /orders)을 바탕에 깔고
 *    소켓 동기화(되살린 세션 콜)로 덮으니 두 길 다 장부의 정거장 연락처(`orderStops`)를 싣는다.
 */
describe('📞 재시작 뒤 정거장 연락처', () => {
    const insertWithContacts = (id: string) => {
        insertCall(id, 9);
        db.prepare(`UPDATE orderStops SET customerNameSnapshot = ?, phoneSnapshot = ? WHERE orderId = ? AND stopType = 'pickup'`).run('상차 가게', '010-1111-2222', id);
        db.prepare(`UPDATE orderStops SET customerNameSnapshot = ?, phoneSnapshot = ? WHERE orderId = ? AND stopType = 'dropoff'`).run('하차 가게', '010-3333-4444', id);
    };

    it('🔴 되살린 세션 콜(소켓 동기화)에 상차 · 하차 전화번호가 있다', async () => {
        insertWithContacts(`${U}-ph1`);
        const log = jest.spyOn(console, 'log').mockImplementation(() => {});
        await restoreAndRecalculateSession(U, io);
        log.mockRestore();
        const c: any = getUserSession(U).myOrders.find((o: any) => o.id === `${U}-ph1`);
        expect(c?.pickupDetails?.[0]).toMatchObject({ customerName: '상차 가게', phone1: '010-1111-2222' });
        expect(c?.dropoffDetails?.[0]).toMatchObject({ customerName: '하차 가게', phone1: '010-3333-4444' });
    });

    it('🔴 관제웹 이력(GET /orders)에도 상차 · 하차 전화번호가 있다', async () => {
        insertWithContacts(`${U}-ph2`);
        let body: any = null;
        const layer = (ordersRouter as any).stack.find((l: any) => l.route?.path === '/' && l.route.methods.get);
        const res = { status: () => res, json: (b: any) => { body = b; return res; } };
        await layer.route.stack[layer.route.stack.length - 1].handle({ user: { id: U }, query: {}, params: {}, headers: {} }, res);
        const c = body?.orders?.find((o: any) => o.id === `${U}-ph2`);
        expect(c?.pickupDetails?.[0]).toMatchObject({ customerName: '상차 가게', phone1: '010-1111-2222' });
        expect(c?.dropoffDetails?.[0]).toMatchObject({ customerName: '하차 가게', phone1: '010-3333-4444' });
    });
});

/**
 * 🧾 **재시작 뒤 카드 칸** — 되살린 세션 콜이 관제웹 카드가 그리는 장부 칸(🏢 배차사 · 📦 물품 · 수수료 · 예약 시각 · 구분 · 계산서 ·
 *    탁송료 · 배송거리 · 게시 시각 · 배차망)을 지난 콜 목록(GET /orders)과 같이 싣는다. 안 실으면 재시작 뒤 카드에서 그 칸이 사라진다.
 */
describe('🧾 재시작 뒤 카드 칸', () => {
    const CARD = {
        dispatcherName: '고양퀵서비스', dispatcherPhone: '031-932-7722', itemDescription: '샘플 박스',
        commissionRate: '23%', scheduleText: '오후3시6', tripType: '편도', billingType: '계산서',
        tollFare: '3,000', postTime: '21:42', targetApp: 'hwamul24',
    } as const;
    it('🔴 되살린 세션 콜에 카드 칸이 장부 그대로 있다', async () => {
        const id = `${U}-card1`;
        insertCall(id, 9);
        db.prepare(`UPDATE orders SET dispatcherName = ?, dispatcherPhone = ?, itemDescription = ?, commissionRate = ?, scheduleText = ?,
                    tripType = ?, billingType = ?, tollFare = ?, postTime = ?, targetApp = ?, deliveryDistance = ? WHERE id = ?`)
            .run(CARD.dispatcherName, CARD.dispatcherPhone, CARD.itemDescription, CARD.commissionRate, CARD.scheduleText,
                CARD.tripType, CARD.billingType, CARD.tollFare, CARD.postTime, CARD.targetApp, 9.8, id);
        const log = jest.spyOn(console, 'log').mockImplementation(() => {});
        await restoreAndRecalculateSession(U, io);
        log.mockRestore();
        const c: any = getUserSession(U).myOrders.find((o: any) => o.id === id);
        expect(c).toMatchObject({ ...CARD, deliveryDistance: 9.8 });
    });
});
