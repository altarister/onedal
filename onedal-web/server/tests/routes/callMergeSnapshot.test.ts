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
import { OFFICE_FIELDS, mergeBaseCall, officeOrderOf } from '@onedal/shared';

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
const steady = (value: any) => JSON.parse(JSON.stringify(Object.fromEntries(Object.entries(value).filter(([k, v]) => !SHAKY.includes(k) && v !== null))));

async function merged(c: any, index: number) {
    clearUserSession(U);
    getUserSession(U).isRestored = true;
    const id = `${U}-${index}`;
    const stamp = { id, timestamp: '2026-11-05T10:00:00+09:00' };
    const spy = jest.spyOn(dispatchEngine, 'evaluateNewOrder').mockImplementation(async () => {});
    await post(ordersRouter, '/confirm', { step: 'BASIC', targetApp: c.network, order: { ...c.confirm, ...stamp, type: 'AUTO_CLICK', rawText: '화면 글' } });
    await post(detailRouter, '/', { step: 'DETAILED', targetApp: c.network, order: { ...c.detail, ...stamp, type: 'AUTO_CLICK' } });
    spy.mockRestore();
    const call = getUserSession(U).pendingOrdersData.get(id);
    OrderRepository.upsertOrder(call, U, 0, call.orderForm === '급송' ? 1 : 0);   // isExpress 는 결재 코드와 같은 규칙 · isShared 는 기준 밖
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
