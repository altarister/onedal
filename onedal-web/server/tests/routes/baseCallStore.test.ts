// @ts-nocheck
import db from '../../src/db';
import { BASE_CALL_COLUMN_TYPES, baseCallFromRow } from '@onedal/shared';
import { OrderRepository } from '../../src/repositories/OrderRepository';
import { compareBaseCall, holdBaseCall, saveHeldBaseCall } from '../../src/services/baseCallCompare';
import { restoreAndRecalculateSession } from '../../src/state/sessionRestore';
import { clearUserSession, getUserSession } from '../../src/state/userSessionStore';
import ordersRouter from '../../src/routes/orders';
import { approvedUser } from '../fixtures/approvedUser';
import * as fileLogger from '../../src/utils/fileLogger';

/**
 * 🎯 **기본 콜 · 화면 기록을 콜 표에 쓰고 되살린다** (계획서 D2).
 * 빈 값은 앞 값을 지우지 않는다 · 재시작 뒤 서버 기억으로 돌아온다 · 관제웹 콜 목록에는 안 나간다.
 */
const U = 'test-base-call-store';
const call = (extra = {}) => ({
    id: 'x', targetApp: 'insung', route: { pickup: { addressDetail: '경기 광주시 경안동 1-2', phone1: '010-1234-5678' }, dropoff: {} },
    money: { lines: [{ kind: 'income', won: 34600 }], paymentType: '카드' }, load: {}, time: { pickup: { reserved: false, day: 0 } }, job: {}, ...extra,
});
const evidence = { seen: [{ at: 't', screen: 'newCall', read: 'text', rawText: '상세 글 010-1234-5678' }] };
const order = (id: string) => ({ id, type: 'AUTO_CLICK', pickup: '경기 광주시 경안동 1-2', dropoff: '서울 용산구 한남동 12', fare: 34600, timestamp: new Date().toISOString(), capturedAt: new Date().toISOString(), targetApp: 'insung' });
const acked = (id: string) => db.prepare(`UPDATE orders SET ackedAt = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?`).run(id);
const rowOf = (id: string) => db.prepare(`SELECT * FROM orders WHERE id = ?`).get(id);

beforeAll(() => approvedUser(U));
afterAll(() => { db.prepare(`DELETE FROM orders WHERE userId = ?`).run(U); clearUserSession(U); });

describe('🎯 기본 콜 저장', () => {
    it('🔴 콜 표에 기본 콜 열이 다 있다 — 지금 DB 에 열이 붙는다', () => {
        const names = new Set(db.prepare(`SELECT name FROM pragma_table_info('orders')`).all().map((r) => r.name));
        expect(Object.keys(BASE_CALL_COLUMN_TYPES).filter((c) => !names.has(c))).toEqual([]);
    });
    it('콜을 저장한 뒤 합쳐 둔 기본 콜 · 기록이 그 행에 남는다 — 오늘(0) · 아니오도', () => {
        OrderRepository.upsertOrder(order(`${U}-a`), U, 0, 0);
        acked(`${U}-a`);
        holdBaseCall(U, `${U}-a`, call(), evidence);
        saveHeldBaseCall(U, `${U}-a`);
        const back = baseCallFromRow(rowOf(`${U}-a`), `${U}-a`, 'insung');
        expect(back.call.route.pickup.phone1).toBe('010-1234-5678');
        expect(back.call.time.pickup).toEqual({ reserved: false, day: 0 });
        expect(back.evidence).toEqual(evidence);
        expect(rowOf(`${U}-a`).money_income_won).toBe(34600);
    });
    it('🔴 뒤 저장에 없는 값은 앞 값을 지우지 않는다', () => {
        OrderRepository.saveBaseCall(`${U}-a`, U, { ...call(), route: { pickup: {}, dropoff: {} }, money: { lines: [] } }, undefined);
        expect(rowOf(`${U}-a`).route_pickup_phone1).toBe('010-1234-5678');
        expect(rowOf(`${U}-a`).money_paymentType).toBe('카드');
    });
    it('🔴 행이 없는 콜은 아무것도 안 만든다', () => {
        holdBaseCall(U, `${U}-none`, call());
        saveHeldBaseCall(U, `${U}-none`);
        expect(rowOf(`${U}-none`)).toBeUndefined();
    });
});

describe('🎯 관제웹 콜 목록', () => {
    it('🔴 기본 콜 · 기록 열은 관제웹에 안 나간다 — 전화번호 · 화면 원문', () => {
        const layer = ordersRouter.stack.find((l) => l.route?.path === '/' && l.route.methods.get);
        let body;
        layer.route.stack[layer.route.stack.length - 1].handle({ user: { id: U }, query: {} }, { status: () => ({ json: (b) => { body = b; } }), json: (b) => { body = b; } });
        const mine = body.orders.find((o) => o.id === `${U}-a`);
        expect(mine).toBeDefined();
        expect(Object.keys(mine).filter((k) => k in BASE_CALL_COLUMN_TYPES)).toEqual([]);
        expect(JSON.stringify(mine)).not.toContain('010-1234-5678');
        expect(mine.route.pickup.addressDetail).toBe(mine.pickup);   // 🎯 실시간 전송과 같은 묶음 (계획서 E)
    });
});

describe('🧹 세션 비우기', () => {
    it('기사 세션을 비우면 합쳐 둔 기본 콜도 비운다 — 다른 기사 것은 남는다', () => {
        const spy = jest.spyOn(fileLogger, 'slog');
        holdBaseCall(U, `${U}-c`, call());
        holdBaseCall(`${U}-other`, `${U}-c`, call());
        getUserSession(U);
        clearUserSession(U);
        compareBaseCall(U, { ...order(`${U}-c`), fare: 1 });
        compareBaseCall(`${U}-other`, { ...order(`${U}-c`), fare: 1 });
        const lines = spy.mock.calls.map(([, line]) => String(line)).filter((line) => line.includes('🔍 [기본 콜 견줌]'));
        expect(lines).toHaveLength(1);
        spy.mockRestore();
    });
});

describe('♻️ 재시작 뒤', () => {
    it('콜 표의 기본 콜이 서버 기억으로 돌아와 이어 오는 보고와 견준다', async () => {
        /* 서버 기억에 한 번도 안 둔 콜 — 콜 표에만 있다 */
        OrderRepository.upsertOrder(order(`${U}-r`), U, 0, 0);
        acked(`${U}-r`);
        OrderRepository.saveBaseCall(`${U}-r`, U, call(), evidence);
        clearUserSession(U);
        await restoreAndRecalculateSession(U, { to: () => ({ emit: () => {} }) });
        const spy = jest.spyOn(fileLogger, 'slog');
        compareBaseCall(U, { ...order(`${U}-r`), id: `${U}-r` });
        expect(spy.mock.calls.some(([, line]) => String(line).includes('🔍 [기본 콜 견줌]') && String(line).includes(`${U}-r`))).toBe(true);
        expect(getUserSession(U).pendingOrdersData.get(`${U}-r`).route.pickup.addressDetail).toBe('경기 광주시 경안동 1-2');   // 🎯 복원한 콜에도 묶음
        spy.mockRestore();
    });
});
