// @ts-nocheck
import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { OFFICE_FIELDS, asShaped, baseCallShapeOf, collectWonOf, fareWonOf, isExpressOf, mergeBaseCall, officeOrderOf, stopAddressOf } from './baseCallToOffice';

/**
 * 🎯 **콜에 펼친 기본 콜 묶음** (계획서 E) — 옛 칸이 있는 값은 옛 칸에서, 옛 칸이 없는 새 값만 원달앱 기본 콜에서.
 * 옛 칸에 없던 값(화물 글 · 유의사항 · 인수증 · 사진 거리 · 연락처)은 기본 콜에 있어도 묶음에 안 들어간다.
 */
const SHEET = JSON.parse(readFileSync(join(__dirname, '../network/callMergeCases.json'), 'utf8'));
const filled = SHEET.cases.filter((c) => c.expectBaseCall);
const mergedOf = (c) => mergeBaseCall({ id: 'c', targetApp: c.network, ...c.expectBaseCall.confirm }, { id: 'c', targetApp: c.network, ...c.expectBaseCall.detail });
const asCall = (shape, c) => ({ id: 'c', targetApp: c.network, ...shape });
const only = (o) => JSON.parse(JSON.stringify(Object.fromEntries(OFFICE_FIELDS.filter((k) => o[k] !== undefined && o[k] !== null && o[k] !== '' && !(Array.isArray(o[k]) && o[k].length === 0)).map((k) => [k, o[k]]))));

describe('🎯 기본 콜 묶음', () => {
    it.each(filled.map((c) => [c.why, c]))('묶음에서 다시 만든 옛 칸 = 옛 칸 — %s', (_w, c) => {
        const shape = baseCallShapeOf(c.expectCall, mergedOf(c));
        /* 옛 칸에 연락처가 없는 배차망은 상세 주소만으로 연락처 칸이 생긴다 — 옛 칸에 넘길지는 정하지 않았다(D3) */
        const office = only(officeOrderOf(asCall(shape, c), {}, {}, true));
        if (c.network !== 'insung') { delete office.pickupDetails; delete office.dropoffDetails; }
        expect(office).toEqual(only(c.expectCall));
    });
    it.each(filled.filter((c) => c.notInOldYet).map((c) => [c.why, c]))('🔴 옛 칸에 없던 값은 기본 콜에 있어도 묶음에 없다 — %s', (_w, c) => {
        const shape = baseCallShapeOf(c.expectCall, mergedOf(c));
        const office = officeOrderOf(asCall(shape, c), {}, {}, true);
        for (const key of c.notInOldYet) expect(office[key]).toBeUndefined();
    });
    it('🔴 옛 칸에 연락처가 없는 배차망은 기본 콜 상호가 묶음에 없다', () => {
        const c = filled.find((x) => x.network === 'kakaopicker' && mergedOf(x).route.dropoff.customerName);
        expect(baseCallShapeOf(c.expectCall, mergedOf(c)).route.dropoff.customerName).toBeUndefined();
    });
    it('옛 칸이 없는 새 값은 기본 콜에서 온다 — 목록 동 · 하차 약속', () => {
        const c = filled.find((x) => mergedOf(x).time?.dropoff?.by && mergedOf(x).route.listRegion);
        const shape = baseCallShapeOf(c.expectCall, mergedOf(c));
        expect(shape.route.listRegion).toEqual(mergedOf(c).route.listRegion);
        expect(shape.time.dropoff.by).toBe(mergedOf(c).time.dropoff.by);
    });
    it('기본 콜이 없는 콜(옛 앱 · 옛 행)은 옛 칸으로만 만든다 — 요금은 종류를 모르는 «옛 요금»', () => {
        const flat = { pickup: '경기 광주시 경안동', dropoff: '서울 용산구 한남동', fare: 34600, reserved: false, reservedDay: 0, dispatcherName: '고양퀵서비스' };
        const shape = baseCallShapeOf(flat);
        expect(shape.route.pickup.addressDetail).toBe('경기 광주시 경안동');
        expect(shape.time.pickup).toEqual({ reserved: false, day: 0 });
        expect(shape.money.lines).toEqual([{ kind: 'unknown', won: 34600, label: '옛 요금' }]);
        expect(shape.route.listRegion).toBeUndefined();
    });
    it('🔴 기본 콜 기억이 밀려도 다시 펼칠 때 새 값이 사라지지 않는다', () => {
        const c = filled.find((x) => mergedOf(x).route.listRegion);
        const once = { ...c.expectCall, ...baseCallShapeOf(c.expectCall, mergedOf(c)) };
        expect(baseCallShapeOf(once).route.listRegion).toEqual(mergedOf(c).route.listRegion);
    });
    it('🔴 옛 앱 콜을 여러 번 펼쳐도 «옛 요금» 줄이 쌓이지 않는다 — 기억 · 평가 · KEEP 마다 펼친다', () => {
        const flat = { pickup: 'X(건물)', dropoff: '서울 용산구 한남동', fare: 1000 };
        const once = { ...flat, ...baseCallShapeOf(flat) };
        const twice = { ...once, ...baseCallShapeOf(once) };
        const thrice = { ...twice, ...baseCallShapeOf(twice) };
        expect(thrice.money.lines).toEqual(once.money.lines);
        expect(once.money.lines).toEqual([{ kind: 'unknown', won: 1000, label: '옛 요금' }]);
    });
    it('🔴 묶음을 다시 펼쳐도 같다 — 기억에 넣을 때마다 펼친다', () => {
        const c = filled[0];
        const once = { ...c.expectCall, ...baseCallShapeOf(c.expectCall, mergedOf(c)) };
        expect(baseCallShapeOf(once, mergedOf(c))).toEqual(baseCallShapeOf(c.expectCall, mergedOf(c)));
    });
});

describe('🚨 급송 — 묶음의 형태 하나로 가른다 (계획서 E2)', () => {
    it.each(filled.map((c) => [c.why, c]))('옛 칸으로 가른 급송과 같다 — %s', (_w, c) => {
        const order = { ...c.expectCall, ...baseCallShapeOf(c.expectCall, mergedOf(c)) };
        expect(isExpressOf(order)).toBe(c.expectCall.orderForm === '급송');
    });
    it('묶음이 없는 콜은 급송이 아니다', () => {
        expect(isExpressOf({ orderForm: '급송' })).toBe(false);
    });
});

describe('🎯 묶음이 있는 콜로 (asShaped)', () => {
    it('이미 펼친 콜은 그 객체 그대로 — 기본 콜에서 온 새 값을 지우지 않는다', () => {
        const c = filled.find((x) => mergedOf(x).route.listRegion);
        const shaped = { ...c.expectCall, ...baseCallShapeOf(c.expectCall, mergedOf(c)) };
        expect(asShaped(shaped)).toBe(shaped);
    });
    it('🔴 묶음 일부만 가진 콜은 가진 값을 지키고 빠진 묶음만 채운다', () => {
        const got = asShaped({ time: { pickup: { day: 1 } }, capturedAt: 't' });
        expect(got.time.pickup.day).toBe(1);
        expect(got.route).toEqual({ pickup: {}, dropoff: {} });
    });
    it('🔴 빠진 묶음은 옛 칸으로 채운다 — 예약 콜이 오늘 콜이 되지 않는다', () => {
        const flat = { pickup: 'a', dropoff: 'b', fare: 1, reservedDay: 1, reservedAt: '18:30', itemDescription: '17:40상차' };
        const { time, ...noTime } = { ...flat, ...baseCallShapeOf(flat) };
        expect(asShaped(noTime).time.pickup).toEqual({ day: 1, at: '18:30' });
    });
    it('🔴 묶음이 없는 콜은 옛 칸으로 펼친다 — 예약 날 · 적요가 비지 않는다', () => {
        const got = asShaped({ pickup: 'a', dropoff: 'b', fare: 1, reservedDay: 1, reservedAt: '09:00', detailMemo: '17:40상차' });
        expect(got.time.pickup).toEqual({ day: 1, at: '09:00' });
        expect(got.job.detailMemo).toBe('17:40상차');
    });
});

/* 💰 요금 — 묶음의 요금 줄에서 한 줄만 고른다. 펼친 콜에서는 옛 요금 칸과 같은 값이다 (계획서 E5) */
describe('💰 요금 (fareWonOf)', () => {
    const shapedOf = (flat, held?) => ({ ...flat, ...baseCallShapeOf(flat, held) });
    const heldWith = (lines) => ({ id: 'c', targetApp: 'insung', route: { pickup: {}, dropoff: {} }, money: { lines }, load: {}, time: {}, job: {} });
    it.each(filled.map((c) => [c.why, c]))('문제지 콜을 펼치면 요금 = 옛 요금 칸 — %s', (_w, c) => {
        expect(fareWonOf(shapedOf(c.expectCall, mergedOf(c)))).toBe(c.expectCall.fare ?? 0);
    });
    it('기본 콜이 없는 콜은 «옛 요금» 줄', () => expect(fareWonOf(shapedOf({ fare: 34600 }))).toBe(34600));
    it('목록 요금 줄이 옛 칸과 같으면 그 줄', () => expect(fareWonOf(shapedOf({ fare: 50000 }, heldWith([{ kind: 'total', won: 50000 }])))).toBe(50000));
    it('목록 요금이 달라도 수입 줄이 옛 칸과 같으면 수입 줄', () =>
        expect(fareWonOf(shapedOf({ fare: 40000 }, heldWith([{ kind: 'total', won: 52000 }, { kind: 'income', won: 40000 }])))).toBe(40000));
    it('🔴 운송료 줄은 안 읽는다 — 상세 글로 채운 요금과 다를 수 있다', () =>
        expect(fareWonOf(shapedOf({ fare: 200000 }, heldWith([{ kind: 'freight', won: 180000 }])))).toBe(200000));
    it('🔴 요금 0 콜은 운송료 줄이 있어도 0', () => expect(fareWonOf(shapedOf({ fare: 0 }, heldWith([{ kind: 'freight', won: 40000 }])))).toBe(0));
    it('🔴 종류 모르는 다른 이름의 줄(«상세 요금»)은 요금이 아니다', () =>
        expect(fareWonOf(shapedOf({ fare: 0 }, heldWith([{ kind: 'unknown', won: 61000, label: '상세 요금' }])))).toBe(0));
    it('요금 줄이 없으면 0', () => expect(fareWonOf({ money: { lines: [] } })).toBe(0));
});

/* 💵 받을 현금 — 착불 현장에서 받는 돈. 받을 현금 줄이 없으면 요금 (기사님 2-2 나 · 인성 «고객에게 받을 금액») */
describe('💵 받을 현금 (collectWonOf)', () => {
    const heldWith = (lines) => ({ id: 'c', targetApp: 'insung', route: { pickup: {}, dropoff: {} }, money: { lines }, load: {}, time: {}, job: {} });
    it('받을 현금 줄이 있으면 그 줄 — 요금과 다른 돈', () => {
        const flat = { fare: 34650 };
        const o = { ...flat, ...baseCallShapeOf(flat, heldWith([{ kind: 'income', won: 34650 }, { kind: 'collect', won: 45000 }])) };
        expect([fareWonOf(o), collectWonOf(o)]).toEqual([34650, 45000]);
    });
    it('받을 현금 줄이 없으면 요금 — 옛 앱 · 원달앱이 잡은 콜 · 다른 배차망', () => expect(collectWonOf({ ...baseCallShapeOf({ fare: 30000 }) })).toBe(30000));
    it('둘 다 없으면 0', () => expect(collectWonOf({ money: { lines: [] } })).toBe(0));
});

/* 📍 정거장 주소 — 묶음의 주소 칸 · 비면 목록 지역 글자 (계획서 E7 · officeOrderOf 와 같은 규칙) */
describe('📍 정거장 주소 (stopAddressOf)', () => {
    it.each(filled.map((c) => [c.why, c]))('문제지 콜을 펼치면 주소 = 옛 칸 — %s', (_w, c) => {
        const o = { ...c.expectCall, ...baseCallShapeOf(c.expectCall, mergedOf(c)) };
        expect([stopAddressOf(o, 'pickup'), stopAddressOf(o, 'dropoff')]).toEqual([c.expectCall.pickup ?? '', c.expectCall.dropoff ?? '']);
    });
    it('묶음이 있으면 묶음의 주소 — 옛 칸이 아니다', () => {
        expect(stopAddressOf({ pickup: '옛', route: { pickup: { addressDetail: '경기 광주시 경안동 1-2' }, dropoff: {} } }, 'pickup')).toBe('경기 광주시 경안동 1-2');
    });
    it('🔴 주소 칸이 비면 빈 글자 — 목록 지역으로 대신하지 않는다(«못 읽음» 경고가 꺼지지 않게)', () => {
        expect(stopAddressOf({ route: { pickup: {}, dropoff: {}, listRegion: { dropoff: '한남동' } } }, 'dropoff')).toBe('');
    });
    it('묶음이 없는 콜은 옛 칸 · 둘 다 없으면 빈 글자', () => {
        expect(stopAddressOf({ pickup: '경안동' }, 'pickup')).toBe('경안동');
        expect(stopAddressOf({}, 'dropoff')).toBe('');
    });
});
