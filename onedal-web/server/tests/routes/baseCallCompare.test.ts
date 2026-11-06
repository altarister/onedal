// @ts-nocheck
import { readFileSync } from 'fs';
import { join } from 'path';
import { baseCallDiff, mergeBaseCall } from '@onedal/shared';
import { compareBaseCall, holdBaseCall } from '../../src/services/baseCallCompare';
import * as fileLogger from '../../src/utils/fileLogger';

/**
 * 🔍 **기본 콜과 지금 콜 값 견주기** (계획서 D1) — 문제지의 차이 칸을 전부 설명할 수 있다.
 * 인성 연락처는 같고, 다른 배차망은 연락처가 있는 정거장(픽커 사진 상호) · `notInOldYet` 칸만 다르다. 주소만 있는 정거장은 연락처가 아니다.
 */
const SHEET = JSON.parse(readFileSync(join(__dirname, '../../../shared/src/network/callMergeCases.json'), 'utf8'));
const filled = SHEET.cases.filter((c) => c.expectBaseCall);
const mergedOf = (c) => mergeBaseCall({ id: 'c', targetApp: c.network, ...c.expectBaseCall.confirm }, { id: 'c', targetApp: c.network, ...c.expectBaseCall.detail });
const CONTACT = ['customerName', 'department', 'contactName', 'phone1', 'phone2'];
const stops = (m) => ['pickup', 'dropoff'].filter((side) => CONTACT.some((k) => m.route[side][k])).map((side) => `${side}Details`);

describe('🔍 기본 콜과 지금 콜 값', () => {
    it.each(filled.map((c) => [c.why, c]))('다른 칸을 설명할 수 있다 — %s', (_w, c) => {
        const merged = mergedOf(c);
        const contact = c.network === 'insung' ? [] : stops(merged);
        expect(baseCallDiff(merged, c.expectCall).sort()).toEqual([...contact, ...(c.notInOldYet ?? [])].sort());
    });
    it('🔴 값이 달라지면 그 칸 이름이 나온다', () => {
        const c = filled[0];
        expect(baseCallDiff(mergedOf(c), { ...c.expectCall, fare: 1 })).toContain('fare');
        expect(baseCallDiff(mergedOf(c), { ...c.expectCall, fare: 1 }).join()).not.toContain('010');
    });
});

describe('🔍 견줌 로그', () => {
    const base = filled.find((c) => c.network === 'insung');
    const call = { id: 'x', targetApp: 'insung', ...base.expectBaseCall.detail };
    let spy;
    beforeEach(() => { spy = jest.spyOn(fileLogger, 'slog').mockImplementation(() => {}); });
    afterEach(() => spy.mockRestore());

    it('결과가 바뀔 때만 한 줄이고 값은 안 남긴다', () => {
        holdBaseCall('u', 'x', call);
        compareBaseCall('u', { ...base.expectCall, id: 'x', fare: 1 });
        compareBaseCall('u', { ...base.expectCall, id: 'x', fare: 1 });
        expect(spy).toHaveBeenCalledTimes(1);
        expect(spy.mock.calls[0][1]).toContain('다른 칸: fare');
        expect(spy.mock.calls[0][1]).not.toContain('010');
        compareBaseCall('u', { ...base.expectCall, id: 'x' });
        expect(spy.mock.calls[1][1]).toContain('같음');
    });
    it('🔴 조각이 없는 옛 앱 콜은 아무것도 안 남긴다', () => {
        holdBaseCall('u', 'y', undefined);
        compareBaseCall('u', { id: 'y', fare: 1 });
        expect(spy).not.toHaveBeenCalled();
    });
    it('🔴 조각이 깨져 있어도 터지지 않는다', () => {
        expect(() => holdBaseCall('u', 'z', { id: 'z' })).not.toThrow();
        expect(() => compareBaseCall('u', { id: 'z' })).not.toThrow();
    });
    it('🔴 번호 없는 콜은 합치지 않는다', () => {
        holdBaseCall('u', 'unknown', call);
        compareBaseCall('u', { id: 'unknown', fare: 1 });
        expect(spy).not.toHaveBeenCalled();
    });
    it('다른 기사의 콜과 섞이지 않는다', () => {
        holdBaseCall('u', 'x2', call);
        compareBaseCall('v', { id: 'x2', fare: 1 });
        expect(spy).not.toHaveBeenCalled();
    });
});
