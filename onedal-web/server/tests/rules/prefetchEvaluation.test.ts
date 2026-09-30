// @ts-nocheck
import db from '../../src/db';
import * as userSessionStore from '../../src/state/userSessionStore';
import { getUserSession, clearUserSession } from '../../src/state/userSessionStore';
import { geocodeAddress, calculateSoloRoute, prefetchSoloRoute } from '../../src/services/kakaoService';
import { OrderEvaluator } from '../../src/core/engine/OrderEvaluator';

/**
 * 🏃 **1차 신호(/confirm)에서 카카오를 미리 출발시킨다** (서버 병목 묶음 3 a+ · onedal-1f «가»).
 *
 * 같은 주소 좌표 · 같은 단독 길찾기(URL 에 상차·하차·기점·옵션이 다 들어 있다)를 판정과 나눠 갖는다 — 두 번 묻지 않는다.
 * 기점이 바뀌면 URL 이 달라 저절로 새로 묻는다. 미리 출발은 세션을 읽기만 하고 알림·저장이 없다.
 * 판정이 끝내 안 오면(문지기에 막힘) 보관이 끝날 때 한 줄로 센다.
 */
const U = 'test-prefetch-eval';
const MARK = `미리검사${[...String(Date.now() % 100000)].map(d => 'ABCDEFGHIJ'[+d]).join('')}`;
const realFetch = global.fetch;
let localCalls = 0, naviCalls = 0;

const fakeKakao = (delayMs = 0) => ((url: string) => { if (url.includes('dapi.kakao.com')) localCalls++; else naviCalls++; return new Promise(r => setTimeout(() => {
    if (url.includes('dapi.kakao.com')) {
        r({ ok: true, status: 200, json: async () => ({ documents: [{ x: '127.3', y: '37.3', address_name: '경기 이천시 부발읍', road_address: null }] }) });
    } else {
        r({ ok: true, status: 200, json: async () => ({ routes: [{ result_code: 0, summary: { duration: 1800, distance: 20000 }, sections: [{ duration: 1800, distance: 20000, roads: [] }] }] }) });
    }
}, delayMs)); }) as any;

beforeAll(() => {
    process.env.KAKAO_REST_API_KEY = process.env.KAKAO_REST_API_KEY || 'test-key';
    db.prepare(`INSERT OR IGNORE INTO users (id, google_id, email, name) VALUES (?, ?, ?, ?)`).run(U, `g-${U}`, 'prefetch@test', '미리출발검사');
});
beforeEach(() => { localCalls = 0; naviCalls = 0; });
afterEach(() => { global.fetch = realFetch; jest.useRealTimers(); jest.restoreAllMocks(); });
afterAll(() => {
    db.prepare(`DELETE FROM geocode_cache WHERE query LIKE ?`).run(`%${MARK}%`);
    db.prepare(`DELETE FROM users WHERE id = ?`).run(U);
    clearUserSession(U);
});

describe('🏃 같은 질문은 한 번만', () => {
    it('🔴 같은 주소를 동시에 두 번 부르면 카카오 좌표 질의는 한 벌만 나간다', async () => {
        global.fetch = fakeKakao(30);
        const a = `경기 이천시 부발읍 경충대로 ${MARK}가`;
        const [r1, r2] = await Promise.all([geocodeAddress(a), geocodeAddress(a)]);
        expect(r1).toEqual(r2);
        const one = localCalls;
        localCalls = 0;
        await geocodeAddress(`경기 이천시 부발읍 경충대로 ${MARK}나`);
        expect(one).toBe(localCalls);
    });

    it('🔴 미리 출발한 단독 길찾기를 판정이 받아 쓴다 · 기점이 바뀌면 새로 묻는다', async () => {
        global.fetch = fakeKakao(30);
        prefetchSoloRoute(127.1, 37.1, 127.2, 37.2, { x: 127.0, y: 37.0 }, 'RECOMMEND', 1);
        await calculateSoloRoute(127.1, 37.1, 127.2, 37.2, { x: 127.0, y: 37.0 }, 'RECOMMEND', 1);
        expect(naviCalls).toBe(1);
        await calculateSoloRoute(127.1, 37.1, 127.2, 37.2, { x: 127.05, y: 37.05 }, 'RECOMMEND', 1);
        expect(naviCalls).toBe(2);
    });

    it('🔴 /confirm 미리 출발 → /detail 판정: 좌표·길찾기를 다시 안 묻는다', async () => {
        global.fetch = fakeKakao(30);
        const session = getUserSession(U);
        session.myOrders = [];
        const base = { pickup: `경기 이천시 부발읍 경충대로 ${MARK}다`, dropoff: `경기 여주시 가남읍 ${MARK}라`, vehicleType: '다마스', fare: 30000, rawText: '', targetApp: 'insung' };
        await new OrderEvaluator('insung').prefetch(U, { ...base });
        const before = { local: localCalls, navi: naviCalls };
        const o = { ...base, id: `${U}-e`, status: 'ORDER_SECURED_EVALUATING', capturedAt: new Date().toISOString() };
        session.pendingOrdersData.set(o.id, o);
        await new OrderEvaluator('insung').evaluate(U, o, { to: () => ({ emit: () => {} }) });
        expect(before.navi).toBe(1);
        expect(localCalls).toBe(before.local);
        expect(naviCalls).toBe(1);
    });
});

describe('🏃 미리 출발은 세션을 읽기만', () => {
    it('🔴 세션 필드 쓰기 0 · 콜 목록·심사 표 그대로', async () => {
        global.fetch = fakeKakao(5);
        const session = getUserSession(U);
        session.myOrders = [];
        const sizes = () => [session.pendingOrdersData.size, session.myOrders.length, session.deviceEvaluatingMap.size, session.pendingDecisions.size];
        const was = sizes();
        const guarded = new Proxy(session, { set: () => { throw new Error('미리 출발이 세션에 썼다'); } });
        jest.spyOn(userSessionStore, 'getUserSession').mockReturnValue(guarded);
        await new OrderEvaluator('insung').prefetch(U, { pickup: `경기 이천시 ${MARK}마`, dropoff: `경기 여주시 ${MARK}바`, targetApp: 'insung' });
        expect(sizes()).toEqual(was);
        expect(naviCalls).toBe(1);
    });
});

describe('🏃 판정이 끝내 안 오면 한 줄', () => {
    it('🔴 보관이 끝날 때까지 판정이 안 가져가면 «판정 안 옴» 한 줄 · 가져가면 안 찍힘', async () => {
        const log = jest.spyOn(console, 'log').mockImplementation(() => {});
        global.fetch = fakeKakao(0);
        jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
        prefetchSoloRoute(127.5, 37.5, 127.6, 37.6, { x: 127.0, y: 37.0 }, 'RECOMMEND', 1);
        prefetchSoloRoute(127.7, 37.7, 127.8, 37.8, { x: 127.0, y: 37.0 }, 'RECOMMEND', 1);
        await jest.advanceTimersByTimeAsync(10);
        await calculateSoloRoute(127.7, 37.7, 127.8, 37.8, { x: 127.0, y: 37.0 }, 'RECOMMEND', 1);
        await jest.advanceTimersByTimeAsync(16_000);
        const lines = log.mock.calls.map(c => c.join(' ')).filter(l => l.includes('🏃 [미리 출발]') && l.includes('판정 안 옴'));
        expect(lines.length).toBe(1);
    });
});
