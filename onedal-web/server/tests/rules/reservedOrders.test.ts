import { readFileSync } from 'fs';
import { join } from 'path';
import db from '../../src/db';
import { handleDecision, restoreAndRecalculateSession } from '../../src/services/dispatchEngine';
import { ensureBusinessDay } from '../../src/state/filterManager';
import { getUserSession, clearUserSession } from '../../src/state/userSessionStore';
import { buildOrderSync } from '../../src/core/helpers';
import { businessDayKey, pickupClockMsOf } from '@onedal/shared';

/**
 * 📅 **예약 보관 — 내일 콜은 오늘 하루에 넣지 않는다** (reviews/23 B-1·B-2 · 기사님 «가 가 가»).
 *
 * KEEP 한 콜이 내일 이후면(`reserved_for` 가 오늘 뒤) 진행 중 콜(`myOrders`)이 아니라 **예약 보관(`reservedOrders`)** 에 둔다.
 * 진행 중 콜을 모으는 45곳은 한 줄도 안 바뀐다 — 들어가는 문(KEEP) · 나오는 문(그날이 되면 옮기기) · 버리는 문(거절) 셋.
 * 옮기는 함수는 하나, 부르는 곳은 둘: 영업일 전환 · 서버 재시작 되살리기(새 날에 뜨면 영업일 전환이 안 돈다).
 */
const U = 'test-reserved-orders';
const io = { to: () => ({ emit: () => {} }) } as any;

const DAY = 86_400_000;
const todayKey = businessDayKey(Date.now());
const keyAfter = (days: number) => { const d = new Date(); d.setDate(d.getDate() + days); return businessDayKey(d.getTime()); };
/** 오늘 h 시 (로컬 = KST) */
const todayAt = (h: number) => { const d = new Date(); d.setHours(h, 0, 0, 0); return d.toISOString(); };

const call = (id: string, extra: Record<string, unknown> = {}) => ({
    id: `${U}-${id}`, type: 'NEW_ORDER', status: 'ORDER_AWAITING_DECISION',
    pickup: '경기 광주시 초월읍', dropoff: '경기 이천시 관고동', fare: 30000,
    timestamp: todayAt(15), capturedAt: todayAt(15), targetApp: 'insung', vehicleType: '다마스',
    ...extra,
}) as any;

beforeAll(() => {
    db.prepare(`INSERT OR IGNORE INTO users (id, google_id, email, name) VALUES (?, ?, ?, ?)`)
      .run(U, `g-${U}`, 'reserved@test', '예약보관검사');
});

afterAll(() => {
    for (const t of ['step_call_pickup', 'step_arrive_pickup', 'step_loaded', 'step_call_dropoff', 'step_arrive_dropoff', 'step_delivered'])
        try { db.prepare(`DELETE FROM ${t} WHERE orderId LIKE ?`).run(`${U}-%`); } catch { /* 표가 없으면 넘어간다 */ }
    db.prepare(`DELETE FROM orderStops WHERE orderId LIKE ?`).run(`${U}-%`);
    db.prepare(`DELETE FROM orders WHERE userId = ?`).run(U);
    for (const t of ['filter_day_results', 'user_filter_phases', 'user_filters', 'user_settings', 'user_judgment'])
        try { db.prepare(`DELETE FROM ${t} WHERE user_id = ?`).run(U); } catch { /* 없으면 넘어간다 */ }
    db.prepare(`DELETE FROM users WHERE id = ?`).run(U);
    clearUserSession(U);
});

describe('📅 들어가는 문 — KEEP', () => {
    it('🔴 내일 콜을 KEEP 하면 예약 보관에 들고, 오늘 하루(진행 중 콜 · 국면 · 관제웹 오늘 목록)는 그대로다', async () => {
        const session = getUserSession(U);
        session.myOrders = [];
        session.reservedOrders = [];
        const o = call('tomorrow', { reserved: true, reservedDay: 1, reservedAt: '09:00' });
        session.pendingOrdersData.set(o.id, o);
        const phaseBefore = session.activeFilter.dispatchPhase;

        await handleDecision(U, o.id, 'ORDER_CONFIRMED', io);

        expect(session.myOrders.map(c => c.id)).not.toContain(o.id);
        expect(session.reservedOrders.map(c => c.id)).toEqual([o.id]);
        expect(session.activeFilter.dispatchPhase).toBe(phaseBefore);
        const row = db.prepare(`SELECT reserved_for, status FROM orders WHERE id = ?`).get(o.id) as any;
        expect(row.reserved_for).toBe(keyAfter(1));
        const sync = buildOrderSync(session as any);
        expect(sync.active.map((c: any) => c.id)).not.toContain(o.id);
        expect(sync.reserved?.map((c: any) => c.id)).toEqual([o.id]);
    });

    it('오늘 안의 예약(reservedDay 0)은 오늘 콜이다 — 진행 중 콜에 든다', async () => {
        const session = getUserSession(U);
        const o = call('today-late', { reserved: true, reservedDay: 0, reservedAt: '18:30' });
        session.pendingOrdersData.set(o.id, o);
        await handleDecision(U, o.id, 'ORDER_CONFIRMED', io);
        expect(session.myOrders.map(c => c.id)).toContain(o.id);
        expect(session.reservedOrders.map(c => c.id)).not.toContain(o.id);
    });
});

describe('📅 나오는 문 — 그날이 되면 진행 중으로', () => {
    it('🔴 영업일 전환이 그날이 된 예약 콜을 진행 중으로 옮긴다 — 아직 먼 것은 남긴다', () => {
        const session = getUserSession(U);
        const due = { ...call('due'), status: 'ORDER_CONFIRMED', reservedFor: todayKey };
        const later = { ...call('later'), status: 'ORDER_CONFIRMED', reservedFor: keyAfter(1) };
        session.myOrders = [];
        session.reservedOrders = [due, later];
        session.businessDay = businessDayKey(Date.now() - DAY);

        expect(ensureBusinessDay(U)).toBe(true);

        expect(session.myOrders.map(c => c.id)).toContain(due.id);
        expect(session.reservedOrders.map(c => c.id)).toEqual([later.id]);
    });

    it('🔴 서버 재시작 되살리기도 장부의 reserved_for 로 가른다 — 새 날에 뜨면 영업일 전환이 안 돌기 때문', async () => {
        const ins = db.prepare(`INSERT OR REPLACE INTO orders (id, type, status, userId, timestamp, capturedAt, pickup, dropoff, fare, targetApp, reserved, reservedDay, reservedAt, reserved_for)
            VALUES (?, 'NEW_ORDER', 'ORDER_CONFIRMED', ?, ?, ?, '상', '하', 10000, 'insung', 1, 1, '09:00', ?)`);
        ins.run(`${U}-r-later`, U, todayAt(10), todayAt(10), keyAfter(1));
        ins.run(`${U}-r-due`, U, todayAt(10), todayAt(10), todayKey);
        clearUserSession(U);

        await restoreAndRecalculateSession(U, io);

        const session = getUserSession(U);
        expect(session.reservedOrders.map(c => c.id)).toContain(`${U}-r-later`);
        expect(session.myOrders.map(c => c.id)).not.toContain(`${U}-r-later`);
        expect(session.myOrders.map(c => c.id)).toContain(`${U}-r-due`);
    });
});

describe('📅 버리는 문 — 예약 콜 거절', () => {
    it('🔴 예약 보관의 콜을 방출하면 보관에서 빠진다 — 다음 날 첫짐으로 안 올라온다', async () => {
        const session = getUserSession(U);
        const o = { ...call('drop'), status: 'ORDER_CONFIRMED', reservedFor: keyAfter(1) };
        session.reservedOrders = [o];
        session.pendingOrdersData.set(o.id, o);

        await handleDecision(U, o.id, 'ORDER_RELEASED_BY_ME', io);

        expect(session.reservedOrders.map(c => c.id)).not.toContain(o.id);
        expect(session.myOrders.map(c => c.id)).not.toContain(o.id);
    });
});

describe('📅 상차 시계 — 예약 날·시각으로 날짜를 만든다 (B-2)', () => {
    const captured = Date.parse(todayAt(15));
    it('🔴 내일 09:00 예약은 내일 09:00 — 오늘 15:20 이 아니다', () => {
        const d = new Date(captured); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0);
        expect(pickupClockMsOf({ reservedDay: 1, reservedAt: '09:00' } as any, captured, 20)).toBe(d.getTime());
    });
    it('오늘 안의 «예약 18:30» 은 오늘 18:30', () => {
        const d = new Date(captured); d.setHours(18, 30, 0, 0);
        expect(pickupClockMsOf({ reservedDay: 0, reservedAt: '18:30' } as any, captured, 20)).toBe(d.getTime());
    });
    it('예약이 없으면 지금처럼 — 잡은 시각 + 잠정', () => {
        expect(pickupClockMsOf({} as any, captured, 20)).toBe(captured + 20 * 60_000);
    });
});

describe('📅 관제웹 서랍의 «예약» 칸 (B-4)', () => {
    const client = (p: string) => readFileSync(join(__dirname, '../../../client-app/src', p), 'utf8');

    it('sync 의 reserved 를 받아 서랍과 머리줄로 — 오늘 덱·시트·지도에는 안 넘긴다', () => {
        expect(client('hooks/useOrderEngine.ts')).toContain('setReservedOrders(payload.reserved ?? []);');
        const dash = client('pages/Dashboard.tsx');
        expect(dash).toMatch(/<Drawer [^\n]*reserved=\{reservedOrders\}/);
        expect(dash).toMatch(/<Header [^\n]*reservedCount=\{reservedOrders\.length\}/);
    });

    it('🔴 0건이면 칸도 숫자도 안 보인다', () => {
        expect(client('components/layout/Drawer.tsx')).toContain('{reserved.length > 0 && (');
        expect(client('components/layout/Header.tsx')).toContain('{!!reservedCount && (');
    });

    it('«⋯ 방출» 은 한 번 펼친 뒤에 누른다 — 오늘 덱의 방출과 같은 두 단계', () => {
        const drawer = client('components/layout/Drawer.tsx');
        expect(drawer).toContain('⋯ 방출');
        expect(drawer).toContain("onDecision?.(c.id, 'ORDER_RELEASED_BY_ME')");
        expect(drawer).toMatch(/<details[\s\S]{0,400}⋯ 방출/);
    });
});
