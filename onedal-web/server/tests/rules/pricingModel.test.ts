import {
    GROSS_RATE_PER_KM,
    NET_RATE_PER_KM,
    VEHICLE_SLOTS,
    TRUCK_CAPACITY_SLOTS,
    EYELINE_ALL,
    rateFloorsFrom,
    slotsUsedOf,
} from "@onedal/shared";

/**
 * 🔴 2026-08-13 — 단가 판정 모델 (docs/필터_재설계_명세.md)
 *
 * 기사님 확정: *"통과 = 요금 ≥ 배송거리 × 단가(차종) × (1 − 눈높이)"*
 * 모든 단계(첫짐·합짐·관내·복귀)가 같은 식이다.
 *
 * 이 테스트는 명세의 숫자와 파생 규칙을 고정한다 — 값이 바뀌면
 * "명세가 바뀐 것인가, 실수인가"를 먼저 물을 것.
 */
describe('단가 판정 모델 — 명세 고정', () => {

    it('총액 시세 폴백 = DB user_filters.vehicle_rates 기본값과 같다', () => {
        // ⚠️ 원천은 DB 다. 이 상수는 DB 를 못 읽을 때만 쓰는 폴백이며 값이 갈라지면 안 된다.
        //    (db.ts 의 defaultRates 와 같은 값 — 기사님 제공 시세표)
        expect(GROSS_RATE_PER_KM['오토바이']).toBe(700);
        expect(GROSS_RATE_PER_KM['다마스']).toBe(800);
        expect(GROSS_RATE_PER_KM['라보']).toBe(900);
        expect(GROSS_RATE_PER_KM['1t']).toBe(1000);
        expect(GROSS_RATE_PER_KM['특수화물']).toBe(3000);
    });

    it('실수령 환산 = 총액 × 0.77 (수수료 23%)', () => {
        expect(NET_RATE_PER_KM['오토바이']).toBe(539);
        expect(NET_RATE_PER_KM['다마스']).toBe(616);
        expect(NET_RATE_PER_KM['라보']).toBe(693);
        expect(NET_RATE_PER_KM['1t']).toBe(770);
    });

    it('적재 칸 — 내 1t 트럭 = 5칸, 1t짐 4 · 라보 2 · 다마스 1 · 승용차 1 · 오토바이 0', () => {
        expect(TRUCK_CAPACITY_SLOTS).toBe(5);
        expect(VEHICLE_SLOTS['1t']).toBe(4);
        expect(VEHICLE_SLOTS['라보']).toBe(2);
        expect(VEHICLE_SLOTS['다마스']).toBe(1);
        expect(VEHICLE_SLOTS['승용차']).toBe(1);
        expect(VEHICLE_SLOTS['오토바이']).toBe(0);   // 조수석 — 짐칸을 안 먹는다
    });

    it('기사님의 조합표가 성립한다 — 라보×2 = 라보+다마스×2 = 다마스×4 = 1t짐', () => {
        expect(slotsUsedOf(['라보', '라보'])).toBe(4);
        expect(slotsUsedOf(['라보', '다마스', '다마스'])).toBe(4);
        expect(slotsUsedOf(['다마스', '다마스', '다마스', '다마스'])).toBe(4);
        expect(slotsUsedOf(['1t'])).toBe(4);
        // 어느 조합이든 + 오토바이는 공짜
        expect(slotsUsedOf(['1t', '오토바이'])).toBe(4);
    });

    it('1t짐(4칸)을 실어도 자투리 1칸이 남는다 — 파레트 2개 놓아도 660mm', () => {
        expect(TRUCK_CAPACITY_SLOTS - slotsUsedOf(['1t'])).toBe(1);   // 다마스급 낱짐 자리
    });

    it('모르는 차종은 만재(4칸)로 보수적으로 센다', () => {
        expect(slotsUsedOf(['이상한차종'])).toBe(4);
        expect(slotsUsedOf([null, undefined])).toBe(8);
    });

    it('눈높이 → 하한 단가: -10% 면 1t 은 693원/km (770 × 0.9)', () => {
        const floors = rateFloorsFrom(10);
        expect(floors['1t']).toBe(693);
        expect(floors['오토바이']).toBe(485);   // 539 × 0.9 = 485.1 → 485
        expect(floors['다마스']).toBe(554);     // 616 × 0.9 = 554.4 → 554
    });

    it('눈높이 0(시세) 이면 하한 = 실수령 시세 그대로', () => {
        expect(rateFloorsFrom(0)).toEqual(NET_RATE_PER_KM);
    });

    it('🔴 DB 요율·수수료를 넘기면 그 값으로 계산한다 — 표를 두 벌 두지 않기 위한 통로', () => {
        // 기사님이 설정에서 1t 을 1,200원으로 올린 상황
        const dbRates = { '1t': 1200, '다마스': 800 };
        const floors = rateFloorsFrom(10, dbRates, 23);
        expect(floors['1t']).toBe(Math.round(1200 * 0.77 * 0.9));   // 832
        expect(floors['다마스']).toBe(554);
        // 폴백 상수(1000원)를 쓰지 않았다는 것 — 이게 갈라지면 앱 필터만 옛 요율로 돈다
        expect(floors['1t']).not.toBe(693);
    });

    it('수수료율도 DB 에서 온다 — 0% 면 총액 그대로', () => {
        expect(rateFloorsFrom(0, { '1t': 1000 }, 0)['1t']).toBe(1000);
    });

    it('눈높이 "전부"(100) 면 전 차종 하한 0 — 금액 무관 통과', () => {
        const floors = rateFloorsFrom(EYELINE_ALL);
        for (const v of Object.keys(NET_RATE_PER_KM)) {
            expect(floors[v]).toBe(0);
        }
    });

    it('판정식이 성립한다 — 다마스 30km 콜 (분당→영등포 예시)', () => {
        const floors = rateFloorsFrom(10);
        const dist = 30;
        // 시세대로 받는 콜(616×30=18,480)은 통과, 20% 깎인 콜은 탈락
        expect(18480 >= dist * floors['다마스']).toBe(true);
        expect(14700 >= dist * floors['다마스']).toBe(false);
    });
});

describe('단가 판정 모델 — 피기백 호환', () => {

    it('새 필드는 전부 optional — 구버전 앱 필터 객체에 없어도 성립한다', () => {
        // 구버전 앱이 파싱하는 형태 (ratePerKm/callDiscountPct/slotsUsed 없음)
        const legacy: import('@onedal/shared').AutoDispatchFilter = {
            allowedVehicleTypes: [], isActive: false, isSharedMode: false,
            driverAction: 'WAITING', dispatchPhase: 'STANDBY',
            pickupRadiusKm: 10, minFare: 30000, maxFare: 1000000,
            destinationCity: '파주', destinationRadiusKm: 10,
            excludedKeywords: [], destinationKeywords: [], customCityFilters: [],
        };
        expect(legacy.ratePerKm).toBeUndefined();   // 컴파일이 되는 것 자체가 검증
    });

    it('activeFilter 스프레드({...filter})에 새 필드가 실려 간다 — scrap.ts 피기백 경로', () => {
        const filter = { minFare: 30000, ratePerKm: rateFloorsFrom(10), callDiscountPct: 10, slotsUsed: 4 };
        const { ...appFilter } = filter;   // scrap.ts 와 같은 방식
        expect(appFilter.ratePerKm!['1t']).toBe(693);
        expect(appFilter.callDiscountPct).toBe(10);
        expect(appFilter.minFare).toBe(30000);      // 구 필드도 그대로 — 구앱 호환
    });
});
