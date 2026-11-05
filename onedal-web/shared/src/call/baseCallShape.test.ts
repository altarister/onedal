// @ts-nocheck
import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { OFFICE_FIELDS, baseCallShapeOf, mergeBaseCall, officeOrderOf } from './baseCallToOffice';

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
    it('🔴 묶음을 다시 펼쳐도 같다 — 기억에 넣을 때마다 펼친다', () => {
        const c = filled[0];
        const once = { ...c.expectCall, ...baseCallShapeOf(c.expectCall, mergedOf(c)) };
        expect(baseCallShapeOf(once, mergedOf(c))).toEqual(baseCallShapeOf(c.expectCall, mergedOf(c)));
    });
});
