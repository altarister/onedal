// @ts-nocheck
import { goalZonesFrom, keepGoalCityOf } from '../../src/state/filterGoals';

/**
 * 🏠 **귀가 뒤 관내 — 복귀콜이 나오기 전까지 관내 필터가 살고, 첫 복귀콜 KEEP 에 사라진다** (38 F41 · 기사님 원문 · 71 «가»).
 * 목적지는 «복귀 켬 · 복귀콜을 잡았나»(shared activeGoals)가 정하고, «복귀콜인가»는 그 콜의 하차가 든 목적지 조각(byGoal)이다.
 * 못 잡는 것: 실제 지도 조각(카카오 경로 · 반경)과 원달앱 필터 판 — 폰 day1 S14 · S19b.
 */
const HOME = '광주시';
const ON = '2026-10-10T05:00:00.000Z';
const kept = (id: string, goalCity: string, at = '2026-10-10T05:10:00.000Z') => ({ id, status: 'ORDER_CONFIRMED', goalCity, capturedAt: at });
const zonesOf = (callTarget: 'DEST' | 'HOME', myOrders: any[]) => goalZonesFrom({
    filter: { destinationCity: '이천시', callTarget, destinationRadiusKm: 15 },
    myOrders, departedAt: null, homeCity: HOME, homeOnAt: callTarget === 'HOME' ? ON : null, me: null,
}).zones.map(z => z.city).sort();

describe('🏠 귀가 뒤 목적지', () => {
    it('🔴 복귀 켬 + 이천 관내 콜(목표 이천) KEEP → 이천 · 광주 둘', () => {
        expect(zonesOf('HOME', [kept('a', '이천시')])).toEqual(['광주시', '이천시']);
    });
    it('🔴 복귀 켬 + 이천 콜을 다 내림 + 복귀콜 없음 → 이천이 남는다', () => {
        expect(zonesOf('HOME', [])).toEqual(['광주시', '이천시']);
    });
    it('대조 — 첫 복귀콜(목표 광주) KEEP → 광주 하나(이천 콜이 남아 있어도)', () => {
        expect(zonesOf('HOME', [kept('a', '이천시', '2026-10-10T04:50:00.000Z'), kept('b', '광주시')])).toEqual(['광주시']);
    });
    it('대조 — 복귀 끔은 지금과 같다(이천)', () => {
        expect(zonesOf('DEST', [kept('a', '이천시')])).toEqual(['이천시']);
    });
});

describe('🎯 KEEP 순간 이 콜의 목표 시 — 관내 콜은 목적지 시 · 그 밖은 필터값', () => {
    const dongSigungu = { 중리동: ['이천시'], 신둔면: ['이천시'] };
    it('🔴 복귀 켬이어도 하차가 이천시면 이천(관내 콜) · 이천 밖이면 필터값(집)', () => {
        expect(keepGoalCityOf({ dropoff: '경기 이천시 중리동 219-1', destCities: ['이천시'], dongSigungu, fallback: HOME })).toEqual({ city: '이천시', from: '하차 시' });
        expect(keepGoalCityOf({ dropoff: '경기 광주시 초월읍 경충대로 1066', destCities: ['이천시'], dongSigungu, fallback: HOME })).toEqual({ city: HOME, from: '필터값' });
        expect(keepGoalCityOf({ dropoff: '경기 용인시 처인구 김량장동', destCities: ['이천시'], dongSigungu, fallback: HOME })).toEqual({ city: HOME, from: '필터값' });   // 집 시 밖 복귀콜도 복귀콜
    });
    it('하차 시를 모르면 필터값으로 물러선다 — 로그 «(필터값)»', () => {
        expect(keepGoalCityOf({ dropoff: '', destCities: ['이천시'], dongSigungu, fallback: HOME })).toEqual({ city: HOME, from: '필터값' });
    });
});
