/**
 * 가격 판정 모델 — 단가(원/km) × 콜할인율.
 *
 * 2026-08-13 기사님 확정 (근거: docs/필터_재설계_명세.md)
 *
 *   통과 = 요금 ≥ 배송거리 × 단가(차종) × (1 − 콜할인율)
 *
 * 모든 단계(첫짐·합짐·관내·복귀)가 같은 식이다. 단계 차이는 어느 콜을
 * 보느냐(키워드)뿐. 고정 금액 하한(minFare)·±거리 여유·×0.8 사다리는
 * 이 모델이 대체한다 — minFare 는 구버전 앱 호환용으로만 남는다.
 *
 * ⚠️ 이 파일은 의도적으로 **아무것도 import 하지 않는다.**
 *    shared 의 순환 참조는 부팅 자체를 막는다 (shared/CLAUDE.md).
 */

/**
 * 차종별 **총액** 시세 (원/km) — 화주가 내는 값. 수수료를 빼기 전이다.
 *
 * ⚠️ **원천은 DB 다** (`user_filters.vehicle_rates` · 설정 화면에서 기사님이 바꾼다).
 *    이 상수는 DB 를 못 읽을 때만 쓰는 **폴백**이며, DB 기본값과 같은 값을 둔다.
 *    서버는 반드시 `SettingsRepository.loadPricingConfig()` 로 읽어 쓸 것 —
 *    여기 값을 직접 쓰면 설정에서 요율을 바꿔도 앱 필터가 안 바뀐다 (표가 두 벌이 된다).
 */
export const GROSS_RATE_PER_KM: Record<string, number> = {
    '오토바이': 700,
    '다마스': 800,
    '라보': 900,
    '승용차': 900,
    '1t': 1000,
    '1.4t': 1100,
    '특수화물': 3000,
};

/**
 * 실수령 환산 시세 (원/km) — 총액 × (1 − 수수료 23%).
 *
 * 전제: **배차앱 표시 금액 = 수수료 공제 후 실수령.**
 * 🔍 검증 대기: 다음 실콜에서 표시 금액과 정산 입금액 대조 (명세 §6).
 *    총액으로 판명되면 이 환산을 걷어내고 총액 그대로 비교한다.
 *
 * ⚠️ 이것도 폴백이다. 수수료율의 원천은 DB `agency_fee_percent`.
 */
export const NET_RATE_PER_KM: Record<string, number> = Object.fromEntries(
    Object.entries(GROSS_RATE_PER_KM).map(([v, gross]) => [v, Math.round(gross * 0.77)])
);

/**
 * 적재 칸 — 내 1t 트럭 = 5칸 (정규 4 + 자투리 1).
 *
 * 현장 체감 분류(기사님 확정): 1t짐 4 · 라보 2 · 다마스 1 · 승용차 1 · 오토바이 0(조수석).
 * 근거는 바닥 면적이 아니라 부피·중량의 최소값 (다마스는 실내높이 1.05m 가 깎는다).
 *
 * 기존 30점 스케일(vehicles.ts VEHICLE_CAPACITY)과의 환산: 1칸 = 7.5점.
 * (파레트 15점 = 2칸 = "1t 에 2개" 그대로 성립)
 */
export const VEHICLE_SLOTS: Record<string, number> = {
    '오토바이': 0,
    '다마스': 1,
    '승용차': 1,
    '라보': 2,
    '1t': 4,
    '특수화물': 4,
};

/** 내 트럭(1t)의 총 칸 수. 자투리 1칸 포함 — 5번째 칸은 낱짐(박스)만 */
export const TRUCK_CAPACITY_SLOTS = 5;

/** 콜할인율 값 중 "전부"(금액 무관) — 100% 할인 허용과 같다 */
export const EYELINE_ALL = 100;

/**
 * 콜할인율(허용 할인 %)를 적용한 차종별 하한 단가표(원/km).
 *
 * 앱은 이 표를 피기백으로 받아 곱셈 하나로 판정한다:
 *   fare ≥ deliveryDistance × ratePerKm[vehicleType]
 *
 * **서버는 반드시 DB 값을 넘겨서 부른다** (`grossRates` = `vehicle_rates`,
 * `agencyFeePercent` = `agency_fee_percent`). 안 넘기면 폴백 상수로 계산되는데,
 * 그러면 기사님이 설정에서 요율을 바꿔도 앱 필터가 안 바뀐다.
 *
 * callDiscountPct = 100 (전부) 이면 전 차종 0 — 금액 무관 통과.
 */
export function rateFloorsFrom(
    callDiscountPct: number,
    grossRates: Record<string, number> = GROSS_RATE_PER_KM,
    agencyFeePercent = 23,
): Record<string, number> {
    const keep = Math.max(0, 1 - callDiscountPct / 100);
    const net = Math.max(0, 1 - agencyFeePercent / 100);
    const floors: Record<string, number> = {};
    for (const [vehicle, gross] of Object.entries(grossRates)) {
        floors[vehicle] = Math.round(gross * net * keep);
    }
    return floors;
}

/**
 * 잡은 콜들의 명목 사용 칸 합계.
 *
 * "명목"이다 — 표시 차종 기준. 통화로 실짐이 확인되면(DECLARED/CONFIRMED)
 * 점수 기반 경로(getRemainingCapacityTypesByPoints)가 더 정확하므로 그쪽을 쓴다.
 * 모르는 차종은 보수적으로 만재(4칸)로 센다.
 */
export function slotsUsedOf(vehicleTypes: Array<string | null | undefined>): number {
    return vehicleTypes.reduce((sum: number, v) => {
        if (!v) return sum + 4;
        const slot = VEHICLE_SLOTS[v.trim()];
        return sum + (slot !== undefined ? slot : 4);
    }, 0);
}
