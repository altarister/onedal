// @ts-nocheck
import * as fileLogger from '../../src/utils/fileLogger';
import db from '../../src/db';
import detailRouter from '../../src/routes/detail';
import ordersRouter from '../../src/routes/orders';
import * as dispatchEngine from '../../src/services/dispatchEngine';
import { getUserSession, clearUserSession } from '../../src/state/userSessionStore';
import { approvedUser } from '../fixtures/approvedUser';

/**
 * 🎯 **지금 서버는 보고의 baseCall · evidence 를 안 읽는다** (계획서 C1) — 그래서 새 앱을 먼저 깔아도 콜 값이 같다.
 * 🔴 order 옆 칸이어야 한다. order 안에 넣으면 메모리 콜에 섞여 소켓으로 관제웹에 나간다.
 * D 묶음에서 서버가 읽기 시작하면 이 검사를 그에 맞게 바꾼다.
 */
const U = 'test-base-call-envelope';
const DEV = 'dev-base-call-envelope';
const io = { to: () => ({ emit: () => {} }) };
const app = { get: (k: string) => (k === 'io' ? io : undefined) };
const handlerOf = (router: any, path: string) => {
    const layer = router.stack.find((l: any) => l.route?.path === path && l.route.methods.post);
    return layer.route.stack[layer.route.stack.length - 1].handle;
};
const baseCall = { id: 'x', targetApp: 'kakaopicker', route: { pickup: { addressDetail: '다른 주소' }, dropoff: {} }, money: { lines: [{ kind: 'income', won: 1 }] }, load: {}, time: {}, job: {} };
const evidence = { seen: [{ at: 't', screen: 'newList', rawText: '목록 글자' }] };
const order = (id: string, rawText: string) => ({ id, type: 'AUTO_CLICK', pickup: '경기 광주시 경안동 1-2', dropoff: '서울 용산구 한남동 12', fare: 50000, timestamp: '2026-11-05T10:00:00+09:00', rawText });
/** 흔들리는 칸(시각 · 서버가 매기는 값)을 뺀 메모리 콜 */
const held = (id: string) => {
    const { capturedAt, statusUpdatedAt, ...rest } = getUserSession(U).pendingOrdersData.get(id) ?? {};
    return { ...rest, id: 'same' };
};
const post = async (router: any, path: string, body: any) => {
    const spy = jest.spyOn(dispatchEngine, 'evaluateNewOrder').mockImplementation(async () => {});
    const res = { status: () => res, json: () => res };
    await handlerOf(router, path)({ app, headers: {}, body: { deviceId: DEV, targetApp: 'kakaopicker', matchType: 'AUTO', capturedAt: 't', ...body } }, res);
    spy.mockRestore();
};

beforeAll(() => {
    db.prepare(`INSERT OR IGNORE INTO users (id, google_id, email, name) VALUES (?, ?, ?, ?)`).run(U, `g-${U}`, 'env@test', '봉투');
    approvedUser(U);
    db.prepare(`INSERT OR IGNORE INTO user_devices (user_id, device_id) VALUES (?, ?)`).run(U, DEV);
});
beforeEach(() => { clearUserSession(U); getUserSession(U).isRestored = true; });
afterAll(() => {
    /* 검사 전용 DB 라 사용자 줄은 둔다 — 비동기 저장이 뒤늦게 사용자를 찾는다 */
    db.prepare(`DELETE FROM user_devices WHERE user_id = ?`).run(U);
    clearUserSession(U);
});

describe('🎯 옛 서버 + 새 앱 보고', () => {
    it('첫 보고 — baseCall · evidence 를 실어도 콜 값이 같고 메모리에 안 섞인다', async () => {
        await post(ordersRouter, '/confirm', { step: 'BASIC', order: order('a1', '화면 글') });
        const before = held('a1');
        clearUserSession(U);
        getUserSession(U).isRestored = true;   // 한 기기의 새 첫 보고는 앞 콜을 치우므로 따로 태운다
        await post(ordersRouter, '/confirm', { step: 'BASIC', order: order('a2', '화면 글'), baseCall, evidence });
        expect(getUserSession(U).pendingOrdersData.has('a2')).toBe(true);
        expect(held('a2')).toEqual(before);
        expect(getUserSession(U).pendingOrdersData.get('a2')).not.toHaveProperty('baseCall');
    });
    it('상세 보고 — baseCall · evidence 를 실어도 콜 값이 같고 메모리에 안 섞인다', async () => {
        await post(detailRouter, '/', { step: 'DETAILED', order: order('b1', '상세 글') });
        await post(detailRouter, '/', { step: 'DETAILED', order: order('b2', '상세 글'), baseCall, evidence });
        expect(getUserSession(U).pendingOrdersData.has('b2')).toBe(true);
        expect(held('b2')).toEqual(held('b1'));
        expect(getUserSession(U).pendingOrdersData.get('b2')).not.toHaveProperty('baseCall');
    });
    it('🔍 첫 보고와 상세 보고의 조각을 합쳐 지금 콜 값과 견준다 — 로그 한 줄', async () => {
        const spy = jest.spyOn(fileLogger, 'slog');
        await post(ordersRouter, '/confirm', { step: 'BASIC', order: order('c1', '화면 글'), baseCall });
        await post(detailRouter, '/', { step: 'DETAILED', order: order('c1', '상세 글'), baseCall });
        expect(spy.mock.calls.some(([, line]) => String(line).includes('🔍 [기본 콜 견줌]') && String(line).includes('c1'))).toBe(true);
        spy.mockRestore();
    });
});
