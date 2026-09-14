import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateBaseCall, toForcedPair, calculateDistanceKm } from '@altari/core-simulator';
import { PICKER_PRESET_BOOK, formatPickerRegion, toPickerCall } from '@altari/ui-simulators';
import { FIXED_NOW, seededRandom } from './seededRandom';

/**
 * 🎯 **픽커 문제지** (2026-09-14 · 카카오픽커_시뮬레이터.md §9-3 · 3단계 3-2)
 *
 * 인성·화물24시 문제지는 요금이 **원** 단위(5만·20만)고 정답이 인성 콜 필터 기준이라 픽커 화면에 못 쓴다.
 * 픽커는 알람 판정의 세 축(요금 하한 · 상차 반경 · 도착지 — `KakaoPickerParser.decide`)을 하나씩 시험하는 문제지를 따로 둔다.
 * `expect` 는 **원달앱 픽커 알람이 울려야 하나(PASS) / 안 울려야 하나(BLOCK)** 다.
 */
const KEY = '픽커기본';
const problems = () => PICKER_PRESET_BOOK.problems[KEY];
/** 시뮬레이터 배차 화면의 기본 현위치(경기 광주시)와 반경 — DispatchPage 기본값과 같다 */
const ctx = { driverLon: 127.2553, driverLat: 37.4095, maxPickupKm: 15 };

describe('픽커 문제지 — §9-3 표 그대로', () => {
    beforeEach(() => { vi.spyOn(Math, 'random').mockImplementation(seededRandom(93)); });
    afterEach(() => { vi.restoreAllMocks(); });

    it('다섯 문제 · 요금 · 정답', () => {
        expect(problems().map(p => [p.fare, p.expect])).toEqual([
            [9900, 'BLOCK'],    // 1 요금 하한 경계 아래
            [10000, 'PASS'],    // 2 요금 하한 경계
            [15000, 'BLOCK'],   // 3 상차 반경 밖
            [15000, 'PASS'],    // 4 줄임 표기로만 맞는 도착지
            [15000, 'PASS'],    // 5 예약 콜도 울린다
        ]);
    });

    it('설정 화면 목록에 있고, 요구하는 판 상태는 도착 목표 성남시 · 알람 요금 하한 10,000', () => {
        expect(PICKER_PRESET_BOOK.menu.map(m => m.key)).toContain(KEY);
        expect(PICKER_PRESET_BOOK.requires[KEY]).toEqual({ destinationCity: '성남시', alarmMinFare: 10000 });
    });

    it('🔴 주소를 전부 찾는다 — 못 찾으면 그 문제는 조용히 건너뛰어진다', () => {
        problems().forEach(p => expect(toForcedPair(p, ctx), p.label).not.toBeNull());
    });

    it('상차 거리 띠 — 3번만 반경 밖(≥ 반경+5km), 나머지는 반경 절반 안', () => {
        problems().forEach((p, i) => {
            const f = toForcedPair(p, ctx)!;
            const d = calculateDistanceKm([ctx.driverLon, ctx.driverLat], [f.pickup.lon, f.pickup.lat]);
            if (i === 2) expect(d, p.label).toBeGreaterThanOrEqual(ctx.maxPickupKm + 5);
            else expect(d, p.label).toBeLessThanOrEqual(ctx.maxPickupKm / 2);
        });
    });

    it('도착지는 전부 성남시 — 도착 축은 4번만 시험한다', () => {
        problems().forEach(p => expect(toForcedPair(p, ctx)!.dropoff.addressDetail, p.label).toContain('성남시'));
    });

    it('4번 도착지는 화면에 «정자3» 으로 줄여 적힌다 — 도착 목표 «정자동» 과 줄임 표기로만 맞는다', () => {
        const f = toForcedPair(problems()[3], ctx)!;
        expect(formatPickerRegion(f.dropoff.addressDetail, f.dropoff.region).dong).toBe('정자3');
    });
});

describe('픽커 문제지 → 픽커 콜', () => {
    beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(FIXED_NOW); vi.spyOn(Math, 'random').mockImplementation(seededRandom(93)); });
    afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

    const callOf = (i: number) => {
        const forced = toForcedPair(problems()[i], ctx)!;
        const draft = generateBaseCall({ ...ctx, minFare: 0 }, forced, seededRandom(700 + i))!;
        return toPickerCall(draft, { minFare: 0, forced }, seededRandom(800 + i));
    };

    it('요금은 배송비 그대로 · 프로모션 0 — 문제지가 정한 요금이 화면의 최종 수익이다', () => {
        [0, 1, 2, 3, 4].forEach(i => {
            const c = callOf(i);
            expect(c.fare).toBe(problems()[i].fare);
            expect(c.deliveryFee).toBe(problems()[i].fare);
            expect(c.promotion).toBe(0);
        });
    });

    it('🔴 5번은 예약 콜 — 문제지의 «17:00» 이 픽커 칸으로 간다 (공통 코드는 칸 이름을 모른다)', () => {
        expect(callOf(4).reservedAt).toBe('17:00');
        expect(callOf(0).reservedAt).toBeUndefined();
    });
});
