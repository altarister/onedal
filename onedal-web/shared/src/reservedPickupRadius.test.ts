import { describe, expect, it } from 'vitest';
import { reservedPickupRadiusKmOf, effectiveRadii } from './phases';

/**
 * 📅 **내일 콜의 상차 반경 — 줄이지 않은 기본 상차 반경** (기사님 «가» · onedal-1f).
 * 오늘 자동 반경(effectiveRadii)은 오늘 첫짐 이야기다 — 내일 콜은 내일 집에서 떠난다.
 * 서버 판정(내일 콜 기점 집)과 앱 알람 필터가 이 한 함수에서 같은 값을 받는다.
 */
describe('📅 내일 콜 상차 반경', () => {
    it('🔴 기본 상차 반경 그대로 — 자동 배율과 무관', () => {
        const base = { pickupRadiusKm: 25 };
        const today = { pickupRadiusKm: 25, radiusAuto: true, radiusDistanceKm: 33.747, radiusBaseKm: 50 };
        expect(effectiveRadii(today).pickupRadiusKm).toBeCloseTo(16.87, 1);
        expect(reservedPickupRadiusKmOf(base)).toBe(25);
    });
    it('🔴 비면 모름(null)', () => {
        expect(reservedPickupRadiusKmOf({})).toBeNull();
        expect(reservedPickupRadiusKmOf(null)).toBeNull();
    });
});
