import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateBaseCall, getPresetFrom, SHARED_PRESET_BOOK, toForcedPair } from '@altari/core-simulator';
import { PICKER_PRESET_BOOK, toPickerCall } from '@altari/ui-simulators';
import { FIXED_NOW, seededRandom } from './seededRandom';

/**
 * 🎯 **픽커 문제지 — «이천 방향» 일곱 지점을 그대로 쓴다** (기사님 확정)
 *
 * 기사님: *"이천 방향 — 집에서 이천까지 일곱 지점, 이 문제로 계속 테스트 중이거든 이걸로 하자"* ·
 * *"서버는 서버대로 문제는 문제대로 했을 때 정답이 계속 바뀌고 그 정답이 맞는가를 확인하면 어때?"*
 *
 * 픽커 문제지는 **지점·순서는 인성 «칠지점» 그대로**, 요금만 P 크기로 바꾸고 **정답·요구 조건을 싣지 않는다.**
 * 정답은 원달앱이 판정하는 순간 그 폰이 가진 필터로 채점한다 (`onedal-sim/scripts/pickerAlarmGrade.mjs`).
 */
const KEY = '칠지점';
const picker = () => PICKER_PRESET_BOOK.problems[KEY];
const shared = () => SHARED_PRESET_BOOK.problems[KEY];
const ctx = { driverLon: 127.2553, driverLat: 37.4095, maxPickupKm: 15 };

describe('픽커 «칠지점» — 인성 «칠지점» 의 지점 그대로', () => {
    it('일곱 문제 · 같은 순서 — 이름에서 인성 정답 표시(⭕/✖)만 뗐다', () => {
        expect(picker().length).toBe(7);
        expect(picker().map(p => p.label)).toEqual(shared().map(p => p.label.replace(/\s*[⭕✖]\s*/g, ' ').replace(/\s+/g, ' ').trim()));
        picker().forEach(p => expect(p.label).not.toMatch(/[⭕✖]/));
    });

    it('🔴 상차·하차 지점이 한 글자도 같다 — 지점은 인성 문제지 한 곳에서 온다', () => {
        picker().forEach((p, i) => {
            const s = shared()[i];
            expect([p.pickup, p.dropoff, p.pickupFallback, p.dropoffFallback, p.pickupBand, p.dropoffBand], p.label)
                .toEqual([s.pickup, s.dropoff, s.pickupFallback, s.dropoffFallback, s.pickupBand, s.dropoffBand]);
        });
    });

    it('요금은 원 ÷ 5 를 10P 단위로 — 인성 5만 원 → 픽커 10,000P · 5천 원 → 1,000P', () => {
        expect(picker().map(p => p.fare)).toEqual([10000, 1000, 10000, 30000, 10000, 10000, 6000]);
    });

    it('🔴 정답 · 차종 · 요구 조건을 싣지 않는다 — 정답은 판정 순간의 폰 필터로 채점한다', () => {
        picker().forEach(p => {
            expect(p.expect, p.label).toBeUndefined();
            expect(p.vehicleType, p.label).toBeUndefined();
        });
        expect(PICKER_PRESET_BOOK.requires[KEY]).toBeUndefined();
    });

    it('설정 화면 목록 · 별칭 seven/7', () => {
        expect(PICKER_PRESET_BOOK.menu.map(m => m.key)).toEqual([KEY]);
        expect(getPresetFrom(PICKER_PRESET_BOOK, 'seven')).toBe(picker());
        expect(getPresetFrom(PICKER_PRESET_BOOK, '7')).toBe(picker());
    });

    it('예전 픽커 문제지(«픽커기본»)는 없다', () => {
        expect(getPresetFrom(PICKER_PRESET_BOOK, '픽커기본')).toBeNull();
    });
});

describe('픽커 «칠지점» → 픽커 콜', () => {
    beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(FIXED_NOW); });
    afterEach(() => { vi.useRealTimers(); });

    it('주소를 전부 찾고, 화면 요금은 문제지 요금 그대로 (프로모션 0 · 예약 없음)', () => {
        picker().forEach((p, i) => {
            const forced = toForcedPair(p, ctx);
            expect(forced, p.label).not.toBeNull();
            const draft = generateBaseCall({ ...ctx, minFare: 0 }, forced!, seededRandom(900 + i))!;
            const call = toPickerCall(draft, { minFare: 0, forced: forced! }, seededRandom(950 + i));
            expect(call.fare, p.label).toBe(p.fare);
            expect(call.promotion, p.label).toBe(0);
            expect(call.reservedAt, p.label).toBeUndefined();
        });
    });
});
