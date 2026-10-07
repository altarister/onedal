// @ts-nocheck
import { baseFilterFromDb } from '../../src/state/userSessionStore';

/**
 * 🧮 **세션 · 기기 · 결재 · 비상 보고의 셈** — 평소 설정 한 줄 읽기를 동작으로 문다.
 */
describe('🎛️ 평소 설정 — user_filters 한 줄을 읽는다', () => {
    it('🔴 오늘 판 칸 셋 · 노선/동선 · 예약 · 제외 지역을 줄에서 읽는다 — 재접속에 안 풀린다', () => {
        const f = baseFilterFromDb('u-base-filter', {
            min_fare: 30000.4, max_fare: 900000, excluded_keywords: '[]', is_active: 1,
            radius_auto: 1, radius_base_km: 7, accepted_vehicle_types: '["1t","다마스"]',
            route_mode: 0, reservation_mode: 'tomorrowToo', excluded_regions: '["R|x"]',
        });
        expect(f).toMatchObject({
            radiusAuto: true, radiusBaseKm: 7, acceptedVehicleTypes: ['1t', '다마스'],
            routeMode: false, reservationMode: 'tomorrowToo', minFare: 30000, isActive: true, excludedRegions: ['R|x'],
        });
    });

    it('🔴 옛 줄(NULL) — 반경 기준은 «모른다» · 노선이 기본 · 오늘 콜만', () => {
        const f = baseFilterFromDb('u-base-filter', {
            min_fare: 1, max_fare: 2, radius_auto: 0, radius_base_km: null, accepted_vehicle_types: null, route_mode: null, reservation_mode: null,
        });
        expect(f.radiusBaseKm).toBeUndefined();
        expect(f).toMatchObject({ radiusAuto: false, routeMode: true, reservationMode: 'today', acceptedVehicleTypes: [] });
    });

    it('🔴 줄이 없으면(신규) 서비스 권장 기본값', () => {
        expect(baseFilterFromDb('u-base-filter', null)).toMatchObject({ minFare: 30000, maxFare: 1000000, isActive: false });
    });
});
