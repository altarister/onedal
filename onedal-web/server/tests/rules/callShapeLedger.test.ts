// @ts-nocheck
import db from '../../src/db';

/**
 * 🧾 **콜 한 칸 · 판 번호 · 기사님 몫 사본** — 장부(orders)에 콜 모양 전체를 담는 칸 셋.
 *    callShape(콜 모양 JSON) · callShapeVersion(그 모양의 판 번호) · incomeWon(기사님 몫 원 — 모르면 NULL).
 *    셋 다 기본값 없음 · NULL 허용 — 칸 셋이 비어 있는 옛 줄은 지금 몸통(옛 칸)으로 되살린다.
 */
const ID = 'test-call-shape-ledger-1';

afterAll(() => { db.prepare(`DELETE FROM orders WHERE id = ?`).run(ID); });

describe('🧾 장부의 콜 한 칸 칸 셋', () => {
    it('orders 에 callShape TEXT · callShapeVersion INTEGER · incomeWon INTEGER — 셋 다 NULL 허용 · 기본값 없음', () => {
        const cols = new Map((db.prepare(`PRAGMA table_info(orders)`).all() as any[]).map(c => [c.name, c]));
        const shapeOf = (name: string) => {
            const c = cols.get(name);
            return c && { type: c.type, notnull: c.notnull, dflt_value: c.dflt_value };
        };
        expect(shapeOf('callShape')).toEqual({ type: 'TEXT', notnull: 0, dflt_value: null });
        expect(shapeOf('callShapeVersion')).toEqual({ type: 'INTEGER', notnull: 0, dflt_value: null });
        expect(shapeOf('incomeWon')).toEqual({ type: 'INTEGER', notnull: 0, dflt_value: null });
    });

    it('칸 셋을 안 적고 넣은 줄은 셋이 NULL — 0원 · 빈 글로 채우지 않는다', () => {
        db.prepare(`INSERT INTO orders (id, timestamp, pickup, dropoff) VALUES (?, ?, ?, ?)`)
            .run(ID, new Date().toISOString(), '경기 이천시 부발읍', '경기 여주시 가남읍');
        const row = db.prepare(`SELECT callShape, callShapeVersion, incomeWon FROM orders WHERE id = ?`).get(ID);
        expect(row).toEqual({ callShape: null, callShapeVersion: null, incomeWon: null });
    });
});

/* ───────────── 저장 → 되살리기 왕복 (고칠 자리 표 3-2-3) ───────────── */
import { callShapeOf, ledgerCopiesOf, incomeOf, businessDayKey } from '@onedal/shared';
import { OrderRepository } from '../../src/repositories/OrderRepository';
import { restoredOrderFrom, restoreAndRecalculateSession } from '../../src/state/sessionRestore';
import { getUserSession, clearUserSession } from '../../src/state/userSessionStore';
import { stepsView } from '../../src/services/stepSeeder';
import ordersRouter from '../../src/routes/orders';

const U = 'test-call-shape-ledger';
const io = { to: () => ({ emit: () => {} }) };
const todayAt = (h: number) => { const d = new Date(); d.setHours(h, 0, 0, 0); return d.toISOString(); };
const keyAfter = (days: number) => { const d = new Date(); d.setDate(d.getDate() + days); return businessDayKey(d.getTime()); };

/** 견본 09 꼴 콜 — 정거장 둘 · 하차 약속 · 담당 · 전화2 · 지역 · 크기 낱말 · 표시 기록 · 돈 줄 · 짐 줄 · 화물번호 · 원문 */
const fullCall = (id: string, extra: Record<string, unknown> = {}) => ({
    id: `${U}-${id}`, targetApp: 'insung', orderNo: '3-9483-2159', clientOrderNo: null, fromOtherOffice: false,
    dispatcherName: '고양퀵서비스', dispatcherPhone: '031-000-0000', requesterName: '쑥쑥 TEST', stageText: '접수',
    type: 'NEW_ORDER', timestamp: todayAt(9), rawText: '의뢰지 쑥쑥 TEST 출발지 …', openedBy: 'APP', capturedMode: 'ALARM', isSimulated: false, verdict: null,
    postTime: '09:00', tagsText: '급 · 착', tripType: '편도', orderForm: '급송', detailMemo: '조심히',
    itemSize: '소형', fare: 42000, vehicleType: '다마스', reserved: false,
    itemDescription: '소형 가전', commissionRate: '23%', tollFare: null, paymentType: '신용', billingType: '계산서',
    pickupDetails: [{
        listText: '초월읍', promiseText: '급송', addressDetail: '경기 광주시 초월읍 경충대로 907', region: '초월읍',
        customerName: '시험상차지', department: '물류팀', contactName: '상차 담당', phone1: '010-1111-1111', phone2: '010-1111-2222',
        requestedDay: 0, requestedTime: null, distanceKm: 3.2, geo: { x: 127.31, y: 37.36 }, geoText: '경기 광주시 초월읍', memo: '정문',
    }],
    dropoffDetails: [{
        listText: '신둔면', promiseText: '14시전', addressDetail: '경기 이천시 신둔면 도자예술로 72', region: '신둔면',
        customerName: '시험하차지', department: '매장', contactName: '하차 담당', phone1: '010-3333-3333', phone2: '010-3333-4444',
        requestedDay: 0, requestedTime: '14:00', distanceKm: 11.1, geo: { x: 127.40, y: 37.30 }, memo: '후문',
    }],
    money: { lines: [{ kind: 'income', won: 33000, shown: '33,000' }, { kind: 'consign', won: 42000, shown: '42,000' }], feeRateText: '23%', paymentType: '신용', paymentShown: '신용', billingType: '계산서', billingShown: '계산서' },
    load: { vehicleText: '다마스', sizeText: '소형', itemText: '소형 가전', lines: [{ kind: 'weight', shown: '10kg' }] },
    status: 'ORDER_CONFIRMED', capturedAt: todayAt(9), capturedDeviceId: 'dev-1', goalCity: '이천시',
    ...extra,
});
/** 콜 모양 칸만(분류 'shape' — 정거장 찍은 글 빠짐) */
const shapeOf = (o: any) => JSON.parse(callShapeOf(o) as string);
/** 장부에 적고 받았음까지 — 받았음 없는 확정 줄은 되살리기 · 콜 목록 문 창 밖이다 */
const keep = (call: any) => { OrderRepository.upsertOrder(call, U, 0); OrderRepository.markAcked(call.id, new Date().toISOString()); };
const rowOf = (id: string) => db.prepare(`SELECT * FROM orders WHERE id = ?`).get(id);
const restore = (row: any) => restoredOrderFrom(row, { visited: {}, judgment: null, contacts: () => ({}) });
/** 비교 열쇠 — 'shape' 칸 + 지금 칸(줄 칸 이름이 다른 보관 날은 한 이름으로) */
const compareKeyOf = (o: any) => ({
    shape: shapeOf(o),
    status: o.status ?? null, completedAt: o.completedAt ?? null, capturedAt: o.capturedAt ?? null,
    reservedFor: (o.reservedFor ?? o.reserved_for) ?? null,
});
const getOrders = () => {
    const layer = (ordersRouter as any).stack.find((l: any) => l.route?.path === '/' && l.route.methods.get);
    const handler = layer.route.stack[layer.route.stack.length - 1].handle;
    let body: any = null;
    handler({ user: { id: U } }, { json: (b: any) => { body = b; }, status: () => ({ json: (b: any) => { body = b; } }) });
    return (body?.orders ?? []) as any[];
};

beforeAll(() => {
    db.prepare(`INSERT OR IGNORE INTO users (id, google_id, email, name) VALUES (?, ?, ?, ?)`).run(U, `g-${U}`, 'shape@test', '콜한칸검사');
});
afterAll(() => {
    db.prepare(`DELETE FROM orders WHERE userId = ?`).run(U);
    try { db.prepare(`DELETE FROM users WHERE id = ?`).run(U); } catch { /* 다른 표가 붙잡으면 넘어간다 */ }
    clearUserSession(U);
});

describe('🧾 저장 → 되살리기 왕복 — 콜 한 칸', () => {
    it('🔴 장부에 적었다 되살리면 콜 모양 칸이 같다 — 하차 약속 · 담당 · 전화2 · 지역 · 크기 낱말 · 표시 기록 · 돈 줄 · 짐 줄이 남는다', () => {
        const call = fullCall('round');
        OrderRepository.upsertOrder(call, U, 0);
        const back = restore(rowOf(call.id));
        expect(shapeOf(back)).toEqual(shapeOf(call));
        expect(back.dropoffDetails[0]).toMatchObject({ promiseText: '14시전', contactName: '하차 담당', phone2: '010-3333-4444', region: '신둔면' });
        expect(back).toMatchObject({ itemSize: '소형', tagsText: '급 · 착', orderNo: '3-9483-2159' });
        expect(back.money?.lines).toHaveLength(2);
        expect(back.load?.lines).toEqual([{ kind: 'weight', shown: '10kg' }]);
        /* 서버 칸은 장부 줄 값 */
        expect(back).toMatchObject({ status: 'ORDER_CONFIRMED', goalCity: '이천시', isExpress: true });
    });

    it('🔴 사본 칸 = 콜 한 칸에서 꺼낸 값 · 기사님 몫 = incomeOf(돈 묶음) · 상차 · 하차 글자 = 첫 상차 · 마지막 하차 목록 글자 · 판 번호 1', () => {
        const call = fullCall('copies');
        OrderRepository.upsertOrder(call, U, 0);
        const row = rowOf(call.id);
        const c = ledgerCopiesOf(call);
        expect(row.incomeWon).toBe(incomeOf(call.money));
        expect(row.incomeWon).toBe(33000);
        expect({ pickup: row.pickup, dropoff: row.dropoff }).toEqual({ pickup: '초월읍', dropoff: '신둔면' });
        for (const k of ['pickup', 'dropoff', 'fare', 'incomeWon', 'isExpress', 'paymentType', 'billingType', 'vehicleType', 'itemDescription', 'tripType', 'orderForm',
            'commissionRate', 'tollFare', 'detailMemo', 'dispatcherName', 'dispatcherPhone', 'scheduleText', 'reservedDay', 'reservedAt', 'deliveryDistance'])
            expect([k, row[k]]).toEqual([k, (c as any)[k]]);
        expect(row.callShapeVersion).toBe(1);
        expect(JSON.parse(row.callShape)).toEqual(shapeOf(call));
    });

    it('🔴 판 번호가 없거나(null) 다르거나(2) 글이 깨졌으면(«{») 옛 길 — 지금 답(ledgerStopsOf)과 같다', () => {
        const call = fullCall('old-path');
        OrderRepository.upsertOrder(call, U, 0);
        const row = rowOf(call.id);
        for (const bad of [{ callShapeVersion: null }, { callShapeVersion: 2 }, { callShape: '{' }, { callShape: null, callShapeVersion: null }]) {
            const r = { ...row, ...bad };
            const back = restore(r);
            const old = OrderRepository.ledgerStopsOf(r, {});
            expect({ p: back.pickupDetails, d: back.dropoffDetails }).toEqual({ p: old.pickupDetails, d: old.dropoffDetails });
            expect(back.dropoffDetails[0].promiseText).toBeUndefined();
        }
    });

    it('🔴 옛 길 · 콜 한 칸 모두 구분 · 형태를 값 목록으로 좁힌다 — 장부 «예약» 형태는 null · «편도»는 그대로', () => {
        const call = fullCall('old-form', { orderForm: '예약' });
        OrderRepository.upsertOrder(call, U, 0);
        const row = rowOf(call.id);
        for (const r of [row, { ...row, callShapeVersion: null }]) {
            const back = restore(r);
            expect(back.orderForm).toBeNull();
            expect(back.tripType).toBe('편도');
        }
    });

    it('🔴 정거장 좌표 — 정거장에 찍힌 좌표가 먼저 · 없으면 장소 장부 좌표', () => {
        const call = fullCall('geo');
        call.dropoffDetails[0].geo = null;
        OrderRepository.upsertOrder(call, U, 0);
        const back = restore({ ...rowOf(call.id), pickupX: 1, pickupY: 2, dropoffX: 3, dropoffY: 4 });
        expect(back.pickupDetails[0].geo).toEqual({ x: 127.31, y: 37.36 });
        expect(back.dropoffDetails[0].geo).toEqual({ x: 3, y: 4 });
    });

    it('🔴 관제웹 콜 목록 문(GET /orders)과 서버 되살리기가 같은 콜을 낸다 · 콜 한 칸 글은 싣지 않는다', () => {
        const call = fullCall('get');
        keep(call);
        const got = getOrders().find(o => o.id === call.id);
        expect(compareKeyOf(got)).toEqual(compareKeyOf(restore(rowOf(call.id))));
        expect(got).not.toHaveProperty('callShape');
        expect(got).not.toHaveProperty('callShapeVersion');
    });

    it('🔴 다시 적을 때 — 콜 한 칸 · 사본 칸은 새 값 · 모르는 요금(0)은 아는 요금을 안 덮는다 · 장소 장부는 그대로', () => {
        const call = fullCall('rewrite');
        OrderRepository.upsertOrder(call, U, 0);
        const places = (db.prepare(`SELECT COUNT(*) n FROM places`).get() as any).n;
        OrderRepository.upsertOrder({ ...call, fare: 0, vehicleType: '라보', itemSize: '중형' }, U, 0);
        const row = rowOf(call.id);
        expect(row.fare).toBe(42000);
        expect(row.vehicleType).toBe('라보');
        expect(JSON.parse(row.callShape).itemSize).toBe('중형');
        expect((db.prepare(`SELECT COUNT(*) n FROM places`).get() as any).n).toBe(places);
    });

    it('🔴 글로 못 바꾸는 콜이면 콜 한 칸만 비우고 줄은 적는다 — 사본 칸은 앞 값을 지키고 옛 길로 되살린다', () => {
        const call = fullCall('cyclic');
        OrderRepository.upsertOrder(call, U, 0);
        const loop: any = { vehicleText: '다마스', sizeText: null, itemText: null, lines: [] };
        loop.self = loop;
        expect(() => OrderRepository.upsertOrder({ ...call, load: loop, vehicleType: null }, U, 0)).not.toThrow();
        const row = rowOf(call.id);
        expect(JSON.parse(row.callShape).vehicleType).toBe('다마스');   // 앞 콜 한 칸 그대로
        expect(row.vehicleType).toBe('다마스');                         // 콜 한 칸이 NULL 이면 빈 사본이 앞 값을 안 덮는다
        const fresh = fullCall('cyclic-new', { load: loop });
        OrderRepository.upsertOrder(fresh, U, 0);
        const r2 = rowOf(fresh.id);
        expect([r2.callShape, r2.callShapeVersion]).toEqual([null, null]);
        expect(restore(r2).pickupDetails[0].listText).toBe('초월읍');
    });
});

describe('🚏 옛 길 — ledgerStopsOf 직접', () => {
    it('옛 줄 칸 + 연락처 → 첫 상차 · 마지막 하차 정거장(지금 답)', () => {
        const row = { pickup: '초월읍', dropoff: '신둔면', scheduleText: '급송', reservedDay: 0, reservedAt: '01:41', deliveryDistance: 11.1, pickupX: 1, pickupY: 2, dropoffX: null, dropoffY: null };
        expect(OrderRepository.ledgerStopsOf(row, { pickupDetails: [{ customerName: '시험상차지', phone1: '010' }], dropoffDetails: [{ customerName: 'a' }, { customerName: '시험하차지' }] })).toEqual({
            pickupDetails: [{ customerName: '시험상차지', phone1: '010', listText: '초월읍', geo: { x: 1, y: 2 }, distanceKm: null, promiseText: '급송', requestedDay: 0, requestedTime: '01:41' }],
            dropoffDetails: [{ customerName: '시험하차지', listText: '신둔면', geo: null, distanceKm: 11.1 }],
        });
    });
});

describe('♻️ 실제 되살리기 — 콜 한 칸이 있는 줄 셋 (상차 완료 · 내일 보관 · 두 번 적은 콜)', () => {
    it('🔴 보관 · 진행 가름 · 세션 콜 = GET /orders = 단계 씨앗 콜 · 상차 완료 줄의 상태 · 하차 시각은 장부 줄 값 · 두 번 적은 콜은 두 번째 값', async () => {
        db.prepare(`DELETE FROM orders WHERE userId = ?`).run(U);
        const picked = fullCall('r-picked');
        keep(picked);
        db.prepare(`UPDATE orders SET status = 'ORDER_PICKED_UP', completedAt = ? WHERE id = ?`).run(todayAt(10), picked.id);
        const held = fullCall('r-held', { reservedFor: keyAfter(1), reserved: true });
        held.pickupDetails[0] = { ...held.pickupDetails[0], requestedDay: 1, requestedTime: '09:00', promiseText: '@낼9시' };
        keep(held);
        const twice = fullCall('r-twice');
        keep(twice);
        const second = { ...twice, timestamp: todayAt(11), vehicleType: '라보', itemSize: '중형' };
        OrderRepository.upsertOrder(second, U, 0);

        clearUserSession(U);
        await restoreAndRecalculateSession(U, io);
        const session = getUserSession(U);
        expect(session.reservedOrders.map(c => c.id)).toEqual([held.id]);
        expect(session.myOrders.map(c => c.id).sort()).toEqual([picked.id, twice.id].sort());

        const gotAll = getOrders();
        expect(gotAll.map(o => o.id)).not.toContain(held.id);
        const seeds = new Map<string, any>();
        const real = OrderRepository.ledgerCallOf.bind(OrderRepository);
        const spy = jest.spyOn(OrderRepository, 'ledgerCallOf').mockImplementation((row: any, contacts: any) => {
            const out = real(row, contacts);
            seeds.set(row.id, { ...row, ...out });
            return out;
        });
        for (const id of [picked.id, held.id, twice.id]) stepsView(id);
        spy.mockRestore();

        const sessionCall = (id: string) => [...session.myOrders, ...session.reservedOrders].find(c => c.id === id);
        for (const id of [picked.id, twice.id]) {
            const want = compareKeyOf(sessionCall(id));
            expect(compareKeyOf(gotAll.find(o => o.id === id))).toEqual(want);
            expect(compareKeyOf(seeds.get(id))).toEqual(want);
        }
        expect(compareKeyOf(seeds.get(held.id))).toEqual(compareKeyOf(sessionCall(held.id)));

        const gotPicked = gotAll.find(o => o.id === picked.id);
        expect([gotPicked.status, gotPicked.completedAt]).toEqual(['ORDER_PICKED_UP', todayAt(10)]);
        expect([sessionCall(picked.id).status, sessionCall(picked.id).completedAt]).toEqual(['ORDER_PICKED_UP', todayAt(10)]);

        expect(sessionCall(twice.id)).toMatchObject({ timestamp: todayAt(11), vehicleType: '라보', itemSize: '중형' });
        expect(shapeOf(sessionCall(twice.id))).toEqual(shapeOf(second));
    });
});
