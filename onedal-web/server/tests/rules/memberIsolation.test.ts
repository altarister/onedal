// @ts-nocheck
import { readFileSync } from 'fs';
import { join } from 'path';
import db from '../../src/db';
import devicesRouter, { touchDeviceSession } from '../../src/routes/devices';
import telemetryRouter from '../../src/routes/telemetry';
import screenWordsRouter from '../../src/routes/screenWords';
import detailRouter from '../../src/routes/detail';
import ordersRouter from '../../src/routes/orders';
import { requireOps } from '../../src/middlewares/authMiddleware';
import { ownsOrder } from '../../src/core/orderOwner';
import { getUserSession, clearUserSession } from '../../src/state/userSessionStore';

/**
 * 👥 **회원끼리 막기 — 문 5개 · 콜 주인** (reviews/29 1단계 A·B · 기사님 «가» · onedal-1f «가»).
 * 기사가 둘(기사님 · 딸)이 되면 «로그인만 하면 전부 주는 문»이 남의 폰 · 이상 기록을 주고,
 * orderId 만 받는 소켓 이벤트·폰 문이 남의 콜에 쓴다. 기준 1: 모든 자료에 주인 · 서버가 읽고 쓸 때 확인.
 */
const A = 'test-iso-a', B = 'test-iso-b';
const DA = 'dev-iso-a', DB = 'dev-iso-b';
const io = { to: () => ({ emit: () => {} }) };
const app = { get: (k: string) => (k === 'io' ? io : undefined) };
const handle = (router: any, method: string, path: string) => {
    const layer = router.stack.find((l: any) => l.route?.path === path && l.route.methods[method]);
    return layer.route.stack[layer.route.stack.length - 1].handle;
};
const handlesOf = (router: any, method: string, path: string) =>
    router.stack.find((l: any) => l.route?.path === path && l.route.methods[method]).route.stack.map((s: any) => s.handle);
const call = async (h: any, req: any) => {
    let status = 200, out: any = null;
    const res = { status: (s: number) => { status = s; return res; }, json: (b: any) => { out = b; return res; } };
    await h({ app, query: {}, params: {}, body: {}, headers: {}, ...req }, res);
    return { status, out };
};

beforeAll(() => {
    for (const [u, d] of [[A, DA], [B, DB]]) {
        db.prepare(`INSERT OR IGNORE INTO users (id, google_id, email, name) VALUES (?, ?, ?, ?)`).run(u, `g-${u}`, `${u}@test`, u);
        db.prepare(`INSERT OR IGNORE INTO user_devices (user_id, device_id) VALUES (?, ?)`).run(u, d);
    }
    touchDeviceSession(DA, A, 0, 'LIST', io);
    touchDeviceSession(DB, B, 0, 'LIST', io);
    for (const d of [DA, DB])
        db.prepare(`INSERT INTO telemetry_anomalies (timestamp, device_id, target_app, failure_reason) VALUES (datetime('now'), ?, 'insung', 'T')`).run(d);
    db.prepare(`INSERT OR IGNORE INTO orders (id, userId, status, timestamp, pickup, dropoff, fare) VALUES ('iso-b-order', ?, 'ORDER_CONFIRMED', datetime('now'), '서울', '부산', 10000)`).run(B);
});
afterAll(() => {
    db.prepare(`DELETE FROM telemetry_anomalies WHERE device_id IN (?, ?)`).run(DA, DB);
    db.prepare(`DELETE FROM orders WHERE id = 'iso-b-order'`).run();
    for (const u of [A, B]) {
        db.prepare(`DELETE FROM user_devices WHERE user_id = ?`).run(u);
        db.prepare(`DELETE FROM users WHERE id = ?`).run(u);
        clearUserSession(u);
    }
});

describe('👥 문 5개 — 자기 것만 · 관리자만', () => {
    it('🔴 GET /api/devices — 자기 폰만', async () => {
        const { out } = await call(handle(devicesRouter, 'get', '/'), { user: { id: A, role: 'USER' } });
        const ids = out.devices.map((d: any) => d.deviceId);
        expect(ids).toContain(DA);
        expect(ids).not.toContain(DB);
    });
    it('🔴 POST /api/devices/clear — 자기 폰만 지운다', async () => {
        await call(handle(devicesRouter, 'post', '/clear'), { user: { id: A, role: 'USER' } });
        const { out } = await call(handle(devicesRouter, 'get', '/'), { user: { id: B, role: 'USER' } });
        expect(out.devices.map((d: any) => d.deviceId)).toContain(DB);
        touchDeviceSession(DA, A, 0, 'LIST', io);
    });
    it('🔴 GET /api/telemetry/anomalies — 자기 폰 기록만', async () => {
        const { out } = await call(handle(telemetryRouter, 'get', '/anomalies'), { user: { id: A, role: 'USER' }, query: { limit: '200' } });
        const devs = new Set(out.data.map((r: any) => r.device_id));
        expect(devs.has(DA)).toBe(true);
        expect(devs.has(DB)).toBe(false);
    });
    it('🔴 GET /api/screen-words/recent — 관리자만(배차망 화면 글은 모든 기사 공통 자료)', () => {
        expect(handlesOf(screenWordsRouter, 'get', '/recent')).toContain(requireOps);
    });
});

describe('👥 콜 주인', () => {
    it('🔴 ownsOrder — DB 행의 주인 · 세션 메모리의 콜 · 남의 콜은 아님', () => {
        expect(ownsOrder(B, 'iso-b-order')).toBe(true);
        expect(ownsOrder(A, 'iso-b-order')).toBe(false);
        getUserSession(A).pendingOrdersData.set('iso-a-mem', { id: 'iso-a-mem', status: 'ORDER_EVALUATING' });
        expect(ownsOrder(A, 'iso-a-mem')).toBe(true);
        expect(ownsOrder(B, 'iso-a-mem')).toBe(false);
        getUserSession(A).pendingOrdersData.delete('iso-a-mem');
    });

    it('🔴 폰 문 /api/orders/detail — 남의 콜 id 로 오면 403', async () => {
        const { status } = await call(handle(detailRouter, 'post', '/'), {
            body: { step: 'DETAILED', deviceId: DA, targetApp: 'insung', order: { id: 'iso-b-order', pickup: '서울', dropoff: '부산', fare: 10000, rawText: '' } },
        });
        expect(status).toBe(403);
    });
    it('🔴 폰 문 /api/orders/decision — 남의 콜이면 403', async () => {
        const { status } = await call(handle(ordersRouter, 'post', '/decision'), { body: { orderId: 'iso-b-order', action: 'CANCEL', deviceId: DA } });
        expect(status).toBe(403);
    });
    it('🔴 폰 문 /api/orders/confirm — 남의 콜 id 로 오면 403', async () => {
        const { status } = await call(handle(ordersRouter, 'post', '/confirm'), {
            body: { step: 'BASIC', deviceId: DA, targetApp: 'insung', order: { id: 'iso-b-order', pickup: '서울', dropoff: '부산', fare: 10000, rawText: '' } },
        });
        expect(status).toBe(403);
    });

    it('🔴 orderId 를 받는 소켓 이벤트는 전부 주인 확인(orderOn)을 거친다 — 새 이벤트를 더하면 여기 걸린다', () => {
        const src = readFileSync(join(__dirname, '../../src/socket/socketHandlers.ts'), 'utf8');
        const bare = [...src.matchAll(/safeOn\(socket, "([\w-]+)",\s*(?:async\s*)?\(([^)]*)\)/g)]
            .filter(m => /orderId/.test(m[2])).map(m => m[1]);
        expect(bare).toEqual([]);
        const guarded = [...src.matchAll(/orderOn\("([\w-]+)"/g)].map(m => m[1]);
        expect(guarded.length).toBeGreaterThanOrEqual(10);
    });
});
