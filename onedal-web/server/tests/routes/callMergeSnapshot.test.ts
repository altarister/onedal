// @ts-nocheck
import { readFileSync } from 'fs';
import { join } from 'path';
import db from '../../src/db';
import detailRouter from '../../src/routes/detail';
import ordersRouter from '../../src/routes/orders';
import { OrderRepository } from '../../src/repositories/OrderRepository';
import * as dispatchEngine from '../../src/services/dispatchEngine';
import { getUserSession, clearUserSession } from '../../src/state/userSessionStore';
import { approvedUser } from '../fixtures/approvedUser';
import { BASE_CALL_COLUMN_TYPES, OFFICE_FIELDS, isExpressOf, mergeBaseCall, officeOrderOf } from '@onedal/shared';

/**
 * 📐 **비교 기준 — 첫 보고와 상세 보고를 합친 콜 값 · 저장 행** (계획서 C1-1).
 * 판정이 읽는 값은 앱 파서도 서버 상세 읽기도 아니라 이 합친 값이다. C2 끝 조건이 이 값과 견준다.
 * 🔴 기대값은 지금 동작이다. 팝업 주소 채우기 · 사진 판독 · 필터 판정 · 관제웹 화면은 안 본다.
 * 🔴 판정 함수는 막아 두어 결재 뒤 값(reservedFor · isShared)은 안 본다. capturedAt · 잡은 방식 칸 · 손으로 연 콜도 안 본다.
 */
const PATH = join(__dirname, '../../../shared/src/network/callMergeCases.json');
const SHEET = JSON.parse(readFileSync(PATH, 'utf8'));
const U = 'test-call-merge';
const DEV = 'dev-call-merge';
const io = { to: () => ({ emit: () => {} }) };
const app = { get: (k: string) => (k === 'io' ? io : undefined) };
const handlerOf = (router: any, path: string) => {
    const layer = router.stack.find((l: any) => l.route?.path === path && l.route.methods.post);
    return layer.route.stack[layer.route.stack.length - 1].handle;
};
const post = async (router: any, path: string, body: any) => {
    const res = { status: () => res, json: () => res };
    await handlerOf(router, path)({ app, headers: {}, body: { deviceId: DEV, matchType: 'AUTO', capturedAt: '2026-11-05T10:00:00+09:00', ...body } }, res);
};
/* 돌릴 때마다 달라지거나 시험 틀이 정한 칸 */
const SHAKY = ['id', 'capturedAt', 'statusUpdatedAt', 'updatedAt', 'createdAt', 'userId', 'judgeUntil', 'detailReceivedAt'];
/* 펼친 기본 콜 묶음(계획서 E)은 baseCallShape 검사가 본다 — 여기서는 옛 칸만 견준다 */
const SHAPE = ['route', 'money', 'load', 'time', 'job', 'stage', 'requesterName', 'fromOtherOffice', 'orderNo', 'clientOrderNo'];
const steady = (value: any) => JSON.parse(JSON.stringify(Object.fromEntries(Object.entries(value).filter(([k, v]) => !SHAKY.includes(k) && !SHAPE.includes(k) && v !== null))));

/**
 * 🎯 **보고 길 셋** (계획서 F2-a) — 옛 앱(order 만) · 지금 앱(order + 기본 콜) · 새 앱(기본 콜 + 봉투, order 없음).
 * 새 앱 길도 옛 칸 값 · 저장 행이 같아야 한다. 넘기는 칸은 배차망 정의 표의 officeFields 가 정한다.
 */
type ReportWay = 'order' | 'withBaseCall' | 'noOrder';
async function merged(c: any, index: number, way: ReportWay | boolean = 'order') {
    if (way === true) way = 'withBaseCall';
    if (way === false) way = 'order';
    const withBaseCall = way !== 'order';
    clearUserSession(U);
    getUserSession(U).isRestored = true;
    const id = `${U}-${index}`;
    const stamp = { id, timestamp: '2026-11-05T10:00:00+09:00' };
    const spy = jest.spyOn(dispatchEngine, 'evaluateNewOrder').mockImplementation(async () => {});
    const part = (which: string) => (withBaseCall && c.expectBaseCall ? { baseCall: { id, targetApp: c.network, ...c.expectBaseCall[which] } } : {});
    if (way === 'noOrder') {
        await post(ordersRouter, '/confirm', { step: 'BASIC', targetApp: c.network, report: { type: 'AUTO_CLICK', rawText: '화면 글', timestamp: stamp.timestamp }, ...part('confirm') });
        await post(detailRouter, '/', { step: 'DETAILED', targetApp: c.network, report: { type: 'AUTO_CLICK', rawText: c.detail.rawText, timestamp: stamp.timestamp }, ...part('detail') });
    } else {
        await post(ordersRouter, '/confirm', { step: 'BASIC', targetApp: c.network, order: { ...c.confirm, ...stamp, type: 'AUTO_CLICK', rawText: '화면 글' }, ...part('confirm') });
        await post(detailRouter, '/', { step: 'DETAILED', targetApp: c.network, order: { ...c.detail, ...stamp, type: 'AUTO_CLICK' }, ...part('detail') });
    }
    spy.mockRestore();
    const call = getUserSession(U).pendingOrdersData.get(id);
    OrderRepository.upsertOrder(call, U, 0, isExpressOf(call) ? 1 : 0);   // isExpress 는 결재 코드와 같은 규칙 · isShared 는 기준 밖
    return { call: steady(call), row: steady(db.prepare(`SELECT * FROM orders WHERE id = ?`).get(id)) };
}

beforeAll(() => {
    db.prepare(`INSERT OR IGNORE INTO users (id, google_id, email, name) VALUES (?, ?, ?, ?)`).run(U, `g-${U}`, 'merge@test', '합친 값');
    approvedUser(U);
    db.prepare(`INSERT OR IGNORE INTO user_devices (user_id, device_id) VALUES (?, ?)`).run(U, DEV);
});
afterAll(() => {
    db.prepare(`DELETE FROM user_devices WHERE user_id = ?`).run(U);
    clearUserSession(U);
});

describe('📐 합친 콜 값 · 저장 행', () => {
    it('문제지가 네 배차망을 모두 담는다', () => {
        expect(new Set(SHEET.cases.map((c) => c.network))).toEqual(new Set(['insung', 'hwamul24', 'kakaopicker', 'isflex']));
    });
    it.each(SHEET.cases.map((c, i) => [c.network, c.why, c, i]))('%s — %s', async (_n, _w, c, i) => {
        const got = await merged(c, i);
        expect(got.call).toEqual(c.expectCall);
        expect(got.row).toEqual(c.expectRow);
    });
    /* 🎯 계획서 D3 — 기본 콜을 실은 보고로 한 번 더. 옛 칸 값 · 저장 행이 같아야 한다(새로 살린 값은 옛 칸에 안 간다) */
    it.each(SHEET.cases.filter((c) => c.expectBaseCall).map((c) => [c.network, c.why, c, SHEET.cases.indexOf(c)]))('기본 콜 보고 · %s — %s', async (_n, _w, c, i) => {
        const got = await merged(c, i, true);
        expect(got.call).toEqual(c.expectCall);
        expect(Object.fromEntries(Object.entries(got.row).filter(([k]) => !(k in BASE_CALL_COLUMN_TYPES)))).toEqual(c.expectRow);
    });
    /**
     * 🎯 계획서 F2-a — order 없이 기본 콜 + 봉투만 보낸 새 앱 보고. 옛 칸 값 · 저장 행이 같아야 한다.
     * 🔴 차이 목록 — 1:1 이 아닌 값은 «같다»가 아니라 사례의 passedButDiffers 에 적는다(픽커 사진 길: 사진 직선 km 가 거리 칸에 있다).
     *    원달앱이 그렇게 보내지 않게 고치는 날(F2-b · KakaoPickerBaseCall 의 사진 거리 대신 채우기) 그 칸을 지운다.
     */
    const diffOf = (c) => c.passedButDiffers ?? [];
    const without = (o, keys) => Object.fromEntries(Object.entries(o).filter(([k]) => !keys.includes(k)));
    it.each(SHEET.cases.filter((c) => c.expectBaseCall).map((c) => [c.network, c.why, c, SHEET.cases.indexOf(c)]))('새 앱 보고(order 없음) · %s — %s', async (_n, _w, c, i) => {
        const got = await merged(c, i, 'noOrder');
        const diff = diffOf(c);
        expect(without(got.call, diff)).toEqual(without(c.expectCall, diff));
        expect(without(Object.fromEntries(Object.entries(got.row).filter(([k]) => !(k in BASE_CALL_COLUMN_TYPES))), diff)).toEqual(without(c.expectRow, diff));
    });
});

/**
 * 🎯 **플러그인이 채운 값 → 합치기 → 옛 칸 = 고정된 합친 값** (계획서 C2 끝 조건).
 * `expectBaseCall` 은 원달앱 `KakaoPickerBaseCallTest` 가 같은 입력으로 내는 값이다 — 두 검사가 이어져야 한다.
 * 🔴 연락처 칸은 뺀다. 앱이 살린 상세 주소 · 상호라 옛 값([])과 다르다. 옛 칸에 넘길지는 D3 전에 정한다.
 * 🔴 사례의 `notInOldYet` 칸도 뺀다. 기본 콜에 새로 살린 값이라 옛 칸에는 아직 없다. 넘길지는 D3 전에 기사님께 여쭙는다.
 */
const COMPARED = OFFICE_FIELDS.filter((k) => k !== 'pickupDetails' && k !== 'dropoffDetails');
const only = (value: any) => Object.fromEntries(COMPARED.filter((k) => value[k] !== undefined && value[k] !== null).map((k) => [k, value[k]]));
describe('🎯 플러그인이 채운 기본 콜', () => {
    const filled = SHEET.cases.filter((c) => c.expectBaseCall);
    it('픽커 사례가 있다', () => expect(filled.length).toBeGreaterThan(0));
    it.each(filled.map((c) => [c.why, c]))('%s', (_w, c) => {
        const id = 'c1';
        const merged = mergeBaseCall({ id, targetApp: c.network, ...c.expectBaseCall.confirm }, { id, targetApp: c.network, ...c.expectBaseCall.detail });
        const office = only(officeOrderOf(merged, { rawText: c.detail.rawText }, {}, true));
        for (const key of c.notInOldYet ?? []) {
            expect(office[key]).toBeDefined();
            delete office[key];
        }
        expect(office).toEqual(only(c.expectCall));
    });
    it.each(filled.filter((c) => c.network === 'insung').map((c) => [c.why, c]))('인성 연락처 칸은 서버 값과 같다 — %s', (_w, c) => {
        const id = 'c1';
        const merged = mergeBaseCall({ id, targetApp: c.network, ...c.expectBaseCall.confirm }, { id, targetApp: c.network, ...c.expectBaseCall.detail });
        const office = officeOrderOf(merged, {}, {}, true);
        expect(office.pickupDetails).toEqual(c.expectCall.pickupDetails);
        expect(office.dropoffDetails).toEqual(c.expectCall.dropoffDetails);
    });
});

/**
 * 🎯 **빈 기본 콜** (계획서 F2-a) — 원달앱이 기본 콜을 못 채워 번호 · 배차망만 보낸 새 앱 보고는
 *    상차 · 하차 · 요금이 빈 옛 앱 보고와 같은 결과다. 자동 콜과 손으로 확정한 콜 두 갈래.
 */
describe('🎯 빈 기본 콜 — 빈 옛 보고와 같은 결과', () => {
    const answerOf = async (body: any) => {
        let code = 200; let answer: any;
        const res = { status: (c: number) => { code = c; return res; }, json: (b: any) => { answer = { code, ...b }; return res; } };
        await handlerOf(detailRouter, '/')({ app, headers: {}, body: { deviceId: DEV, capturedAt: '2026-11-05T10:00:00+09:00', step: 'DETAILED', targetApp: 'insung', ...body } }, res);
        return answer;
    };
    const run = async (id: string, matchType: string, type: string, newApp: boolean) => {
        clearUserSession(U);
        getUserSession(U).isRestored = true;
        const spy = jest.spyOn(dispatchEngine, 'evaluateNewOrder').mockImplementation(async () => {});
        const body = newApp
            ? { matchType, report: { type, timestamp: '2026-11-05T10:00:00+09:00' }, baseCall: { id, targetApp: 'insung', route: { pickup: {}, dropoff: {} }, money: { lines: [] }, load: {}, time: {}, job: {} } }
            : { matchType, order: { id, type, pickup: '', dropoff: '', fare: 0, timestamp: '2026-11-05T10:00:00+09:00' } };
        const answer = await answerOf(body);
        const called = spy.mock.calls.length;
        spy.mockRestore();
        const call = getUserSession(U).pendingOrdersData.get(id) ?? getUserSession(U).myOrders.find((o) => o.id === id);
        return { answer: { ...answer, orderId: undefined }, called, call: call && steady({ ...call, id: undefined }) };
    };
    /* 🔢 번호가 빈 기본 콜(픽커 목록 줄 꼴)은 옛 길의 «번호 없는 콜» 갈래 — 기기가 심사 중인 콜 번호를 쓴다 */
    it('🔴 번호가 빈 기본 콜은 기기가 심사 중인 콜 번호로 간다', async () => {
        clearUserSession(U);
        const session = getUserSession(U);
        session.isRestored = true;
        session.deviceEvaluatingMap.set(DEV, `${U}-held-no`);
        const spy = jest.spyOn(dispatchEngine, 'evaluateNewOrder').mockImplementation(async () => {});
        await answerOf({ matchType: 'AUTO', report: { type: 'AUTO_CLICK' }, baseCall: { id: '', targetApp: 'insung', route: { pickup: { addressDetail: '경기 광주시 경안동 1-2' }, dropoff: { addressDetail: '서울 용산구 한남동 12' } }, money: { lines: [{ kind: 'income', won: 30000 }] }, load: {}, time: {}, job: {} } });
        spy.mockRestore();
        expect(session.pendingOrdersData.get(`${U}-held-no`)?.pickup).toBe('경기 광주시 경안동 1-2');
        expect(session.pendingOrdersData.has('unknown')).toBe(false);
    });
    /* 🔢 번호가 빈 상세 조각은 기기가 심사 중인 콜의 앞 기억과 합쳐 만든다 — 이번 조각만으로 만들면 빈 상차 · 요금이 앞 값을 지운다 */
    it('🔴 번호가 빈 상세 조각도 /confirm 때 받은 상차 · 요금을 지우지 않는다', async () => {
        clearUserSession(U);
        const session = getUserSession(U);
        session.isRestored = true;
        const id = `${U}-held-keep`;
        const spy = jest.spyOn(dispatchEngine, 'evaluateNewOrder').mockImplementation(async () => {});
        await post(ordersRouter, '/confirm', { step: 'BASIC', targetApp: 'insung', report: { type: 'AUTO_CLICK', rawText: '화면 글' }, baseCall: { id, targetApp: 'insung', route: { pickup: { addressDetail: '경기 광주시 경안동 1-2' }, dropoff: { addressDetail: '서울 용산구 한남동 12' } }, money: { lines: [{ kind: 'income', won: 30000 }] }, load: {}, time: {}, job: {} } });
        session.deviceEvaluatingMap.set(DEV, id);
        await answerOf({ matchType: 'AUTO', report: { type: 'AUTO_CLICK', rawText: '상세 글' }, baseCall: { id: '', targetApp: 'insung', route: { pickup: {}, dropoff: {} }, money: { lines: [] }, load: {}, time: {}, job: {} } });
        spy.mockRestore();
        const call = session.pendingOrdersData.get(id);
        expect([call?.pickup, call?.fare]).toEqual(['경기 광주시 경안동 1-2', 30000]);
    });
    /* 🧯 원달앱 최소 기본 콜(플러그인이 못 채워 평평 콜에서 · 계획서 F2-b) — 요금은 «옛 요금» 한 줄 · 서버가 만든 콜의 요금이 0 이 아니다 */
    it('🔴 «옛 요금» 한 줄뿐인 최소 기본 콜도 요금이 선다', async () => {
        clearUserSession(U);
        const session = getUserSession(U);
        session.isRestored = true;
        const id = `${U}-minimal`;
        const spy = jest.spyOn(dispatchEngine, 'evaluateNewOrder').mockImplementation(async () => {});
        await post(ordersRouter, '/confirm', { step: 'BASIC', targetApp: 'kakaopicker', report: { type: 'AUTO_CLICK', rawText: '목록 글', timestamp: '2026-11-05T10:00:00+09:00' }, baseCall: { id, targetApp: 'kakaopicker', route: { listRegion: { pickup: '광주 경안', dropoff: '강남 역삼1' }, pickup: {}, dropoff: {} }, money: { lines: [{ kind: 'unknown', won: 30000, label: '옛 요금' }] }, load: { vehicleType: '다마스' }, time: { pickup: {} }, job: {} } });
        spy.mockRestore();
        const call = session.pendingOrdersData.get(id);
        expect([call?.pickup, call?.fare, call?.vehicleType]).toEqual(['광주 경안', 30000, '다마스']);
    });
    it.each([['자동', 'AUTO', 'AUTO_CLICK'], ['손 확정', 'MANUAL', 'MANUAL_CLICK']])('%s', async (_n, matchType, type) => {
        const old = await run(`${U}-empty-old-${matchType}`, matchType, type, false);
        const neu = await run(`${U}-empty-new-${matchType}`, matchType, type, true);
        expect(neu).toEqual(old);
    });
});
