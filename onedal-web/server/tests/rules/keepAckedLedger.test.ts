// @ts-nocheck
import Database from 'better-sqlite3';
import db, { migrateAckedAtColumn } from '../../src/db';
import detailRouter from '../../src/routes/detail';
import { handleDecision } from '../../src/services/dispatchEngine';
import { ackDecision } from '../../src/state/decisions';
import { getUserSession, clearUserSession } from '../../src/state/userSessionStore';
import { restoreWhere, RESTORABLE_STATUSES } from '@onedal/shared';
import { approvedUser } from '../fixtures/approvedUser';

/**
 * 🧾 **장부의 «확정»은 폰이 받았다고 답해야 되살린다** (35 X7 ② · 기사님 «가»).
 *
 * KEEP 결재 때 장부에 confirmed 를 쓰지만, 폰이 그 결재를 실행했다는 «받았음» 전에 서버가 다시 뜨면
 * 폰은 콜을 안 잡았는데 장부엔 «확정»이 남아 유령 콜이 진행 중으로 되살아났다 — 경로 · 적재 · 경유를 좁힌다.
 * 그래서 orders.ackedAt 에 받았음 시각을 적고, 복구 창(restoreWhere)은 받았음이 없는 확정 줄을 안 읽는다.
 * 받았음이 영영 안 오는 KEEP(결재 줄 없는 직접 건)과 시한 끝 KEEP 방어는 그 자리에서 찍는다.
 */
const U = 'test-keep-acked';
const DEV = 'dev-keep-acked';
const io = { to: () => ({ emit: () => {} }) };
const app = { get: (k: string) => (k === 'io' ? io : undefined) };
const todayAt = (h: number) => { const d = new Date(); d.setHours(h, 0, 0, 0); return d.toISOString(); };

const restorable = () => {
    const w = restoreWhere(Date.now());
    const statusIn = RESTORABLE_STATUSES.map(() => '?').join(', ');
    return (db.prepare(`SELECT id FROM orders WHERE userId = ? AND status IN (${statusIn}) AND ${w.sql}`)
        .all(U, ...RESTORABLE_STATUSES, ...w.params) as { id: string }[]).map(r => r.id);
};
const ackedAtOf = (id: string) => (db.prepare(`SELECT ackedAt FROM orders WHERE id = ?`).get(id) as any)?.ackedAt;
const cached = (id: string) => ({
    id, type: 'NEW_ORDER', status: 'ORDER_AWAITING_DECISION',
    pickup: '경기 이천시 부발읍', dropoff: '경기 여주시 가남읍', fare: 30000,
    timestamp: todayAt(10), capturedAt: todayAt(10), targetApp: 'insung', vehicleType: '다마스',
    pickupX: 127.47, pickupY: 37.26, dropoffX: 127.55, dropoffY: 37.21,
});
const keep = async (id: string, queued: boolean) => {
    const session = getUserSession(U);
    session.pendingOrdersData.set(id, cached(id) as any);
    if (queued) session.pendingDecisions.set(id, { action: null, evaluatedAt: Date.now() });
    await handleDecision(U, id, 'ORDER_CONFIRMED', io);
    return session;
};
let savedKey: string | undefined;

beforeAll(() => {
    savedKey = process.env.KAKAO_REST_API_KEY;
    delete process.env.KAKAO_REST_API_KEY;
    db.prepare(`INSERT OR IGNORE INTO users (id, google_id, email, name) VALUES (?, ?, ?, ?)`).run(U, `g-${U}`, 'keep-acked@test', '받았음장부검사');
    approvedUser(U);
    db.prepare(`INSERT OR IGNORE INTO user_devices (user_id, device_id) VALUES (?, ?)`).run(U, DEV);
});
afterEach(() => { jest.useRealTimers(); clearUserSession(U); });
afterAll(() => {
    if (savedKey !== undefined) process.env.KAKAO_REST_API_KEY = savedKey;
    db.prepare(`DELETE FROM orderStops WHERE orderId LIKE ?`).run(`${U}-%`);
    db.prepare(`DELETE FROM orders WHERE userId = ?`).run(U);
    db.prepare(`DELETE FROM user_devices WHERE user_id = ?`).run(U);
    clearUserSession(U);
});

describe('🧾 받았음이 없는 확정은 되살리지 않는다', () => {
    it('🔴 결재 줄이 있는 KEEP — 받았음 전에는 장부에 받았음이 없고 복구 창에 안 나온다', async () => {
        await keep(`${U}-queued`, true);
        expect(ackedAtOf(`${U}-queued`)).toBeNull();
        expect(restorable()).not.toContain(`${U}-queued`);
    });

    it('🔴 폰이 받았다고 답하면 받았음이 찍혀 복구 창에 나온다', async () => {
        const session = await keep(`${U}-acked`, true);
        ackDecision(io, session, U, `${U}-acked`, '검사');
        expect(ackedAtOf(`${U}-acked`)).not.toBeNull();
        expect(restorable()).toContain(`${U}-acked`);
    });

    it('🔴 결재 줄이 없는 KEEP(받았음이 영영 안 옴 · 받았음이 장부 쓰기보다 먼저 와 줄이 이미 지워진 때도) — 바로 찍힌다', async () => {
        await keep(`${U}-direct`, false);
        expect(ackedAtOf(`${U}-direct`)).not.toBeNull();
        expect(restorable()).toContain(`${U}-direct`);
    });

    it('🔴 시한이 끝나도 받았음이 없던 KEEP 은 메모리에 남기므로 장부에도 받았음을 찍는다', async () => {
        jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
        const id = `${U}-timeout`;
        let out: any = null;
        const res = { status: () => res, json: (b: any) => { out = b; return res; } };
        const layer = detailRouter.stack.find((l: any) => l.route?.path === '/' && l.route.methods.post);
        await layer.route.stack[layer.route.stack.length - 1].handle({ body: {
            step: 'DETAILED', deviceId: DEV, targetApp: 'insung',
            order: { id, pickup: '경기 이천시 부발읍', dropoff: '경기 여주시 가남읍', fare: 30000, vehicleType: '다마스', rawText: '' },
        }, app }, res);
        const session = getUserSession(U);
        db.prepare(`INSERT OR REPLACE INTO orders (id, type, status, userId, timestamp, capturedAt, pickup, dropoff, fare, targetApp)
                    VALUES (?, 'NEW_ORDER', 'ORDER_CONFIRMED', ?, ?, ?, '상', '하', 30000, 'insung')`).run(id, U, todayAt(10), todayAt(10));
        session.pendingDecisions.get(id).action = 'KEEP';
        jest.advanceTimersByTime(60_000);
        expect(session.pendingDecisions.has(id)).toBe(false);
        expect(ackedAtOf(id)).not.toBeNull();
    });
});

describe('🧾 서버가 다시 뜬 사이 폰이 KEEP 을 실행했다 — 결재 줄 없이 온 받았음', () => {
    it('🔴 장부의 받았음 없는 확정 줄에 찍는다 — 안 찍으면 진짜 잡은 콜이 다음 복구에서 빠진다 · 확정이 아닌 줄은 안 건드린다', () => {
        const ins = db.prepare(`INSERT OR REPLACE INTO orders (id, type, status, userId, timestamp, capturedAt, pickup, dropoff, fare, targetApp)
                    VALUES (?, 'NEW_ORDER', ?, ?, ?, ?, '상', '하', 30000, 'insung')`);
        ins.run(`${U}-late`, 'ORDER_CONFIRMED', U, todayAt(10), todayAt(10));
        ins.run(`${U}-late-cancel`, 'ORDER_RELEASED_BY_ME', U, todayAt(10), todayAt(10));
        const session = getUserSession(U);   // 다시 뜬 서버 — 결재 줄이 없다
        ackDecision(io, session, U, `${U}-late`, '검사');
        ackDecision(io, session, U, `${U}-late-cancel`, '검사');
        expect(ackedAtOf(`${U}-late`)).not.toBeNull();
        expect(ackedAtOf(`${U}-late-cancel`)).toBeNull();
    });
});

describe('🧾 칸을 처음 붙이는 옛 장부', () => {
    it('🔴 옛 줄은 받았음으로 메운다 — 안 메우면 지금 진행 중인 확정 콜이 다음 재시작에 사라진다', () => {
        const old = new Database(':memory:');
        old.exec(`CREATE TABLE orders (id TEXT, status TEXT, timestamp TEXT, capturedAt TEXT)`);
        old.prepare(`INSERT INTO orders VALUES ('옛확정', 'ORDER_CONFIRMED', '2026-10-08T01:00:00.000Z', '2026-10-08T01:00:05.000Z')`).run();
        migrateAckedAtColumn(old);
        expect((old.prepare(`SELECT ackedAt FROM orders WHERE id = '옛확정'`).get() as any).ackedAt).toBe('2026-10-08T01:00:05.000Z');
        old.prepare(`INSERT INTO orders (id, status) VALUES ('새확정', 'ORDER_CONFIRMED')`).run();
        migrateAckedAtColumn(old);   // 이미 칸이 있으면 메우지 않는다 — 새 줄의 NULL 은 «아직 못 받음»이다
        expect((old.prepare(`SELECT ackedAt FROM orders WHERE id = '새확정'`).get() as any).ackedAt).toBeNull();
    });
});
