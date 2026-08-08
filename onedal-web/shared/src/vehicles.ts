export const VEHICLE_OPTIONS = [
    '오토바이', 
    '다마스', 
    '라보', 
    '승용차', 
    '1t', 
    '1.4t', 
    '2.5t', 
    '3.5t', 
    '5t', 
    '11t', 
    '25t', 
    '특수화물'
] as const;

export type VehicleType = typeof VEHICLE_OPTIONS[number];

/**
 * 물류/배차 중심의 차량 이름을 카카오내비 기준 차종 코드(car_type)로 매핑합니다.
 * 카카오내비 기준:
 * 1: 1종 (승용차/소형승합/소형화물)
 * 2: 2종 (중형승합/중형화물)
 * 3: 3종 (대형승합/2축 대형화물)
 * 4: 4종 (3축 대형화물)
 * 5: 5종 (4축 이상 특수화물)
 * 6: 6종 (경차)
 * 7: 이륜차 (오토바이)
 */
export function mapVehicleToKakaoCarType(vehicle: string): number {
    switch(vehicle) {
        case '오토바이':
            return 7; // 이륜차
        case '특수화물':
            return 5; // 특수화물
        case '11t':
        case '25t':
            return 4; // 4종 대형화물
        case '5t':
            return 3; // 3종 대형화물
        case '2.5t':
        case '3.5t':
            return 2; // 2종 중형화물
        case '1t':
        case '1.4t':
        case '다마스':
        case '라보':
        case '승용차':
        default:
            return 1; // 1종 소형화물 (디폴트)
    }
}

// ─────────────────────────────────────────────────────────────
//  적재 용량 모델
// ─────────────────────────────────────────────────────────────

/**
 * 차종별 적재 점수. 1t 트럭 = 30점 기준.
 *
 * 기사님 실측 규칙 (2026-08-09):
 *   1t 트럭 한 대에  1t짐 ×1  =  라보 ×2  =  다마스 ×3  =  승용차 ×5
 *   오토바이 짐은 조수석에 실으므로 짐칸을 점유하지 않는다(0점, 상한 없음).
 * 최소공배수 30을 1t 용량으로 잡아 위 비율을 정수로 표현했다.
 * 1t 초과 차종은 톤당 30점 비례.
 *
 * ⚠️ VEHICLE_OPTIONS 배열 순서에 의존하지 말 것.
 *    그 배열은 UI 드롭다운 표시용이며 실제 용량 순서와 다르다.
 *    (승용차 6점 < 다마스 10점 인데 배열에는 승용차가 라보 뒤에 있음)
 */
export const VEHICLE_CAPACITY: Record<string, number> = {
    '오토바이': 0,
    '승용차': 6,
    '다마스': 10,
    '라보': 15,
    '1t': 30,
    '1.4t': 42,
    '2.5t': 75,
    '3.5t': 105,
    '5t': 150,
    '11t': 330,
    '25t': 750,
    '특수화물': 750,
};

/** 앱 파서가 뽑는 축약 코드(오/다/라 등)를 정식 차종명으로 보정 */
const VEHICLE_ALIASES: Record<string, string> = {
    '오': '오토바이', '바이크': '오토바이', '오토': '오토바이',
    '다': '다마스',
    '라': '라보',
    '승': '승용차',
    '1.4': '1.4t', '2.5': '2.5t', '3.5': '3.5t',
};

/** 차종 문자열을 VEHICLE_CAPACITY 키로 정규화. 알 수 없으면 null */
export function normalizeVehicleType(raw?: string | null): string | null {
    if (!raw) return null;
    const v = raw.trim();
    if (VEHICLE_CAPACITY[v] !== undefined) return v;
    if (VEHICLE_ALIASES[v]) return VEHICLE_ALIASES[v];
    return null;
}

/** 차종의 적재 점수. 알 수 없는 차종은 fallback 차종의 점수로 간주(보수적) */
function capacityOf(vehicle: string | null | undefined, fallback: string): number {
    const key = normalizeVehicleType(vehicle) ?? normalizeVehicleType(fallback) ?? '1t';
    return VEHICLE_CAPACITY[key] ?? VEHICLE_CAPACITY['1t'];
}

/**
 * [빈차 기준] 내 차로 수행 가능한 콜 등급 목록.
 *
 * 관제탑 필터의 기본 허용 차종을 만들 때 사용한다.
 * 예: 내 차가 1t → 오토바이·승용차·다마스·라보·1t
 *
 * @param myVehicle 기사님 차종 (user_settings.vehicle_type)
 */
export function getEligibleVehicleTypes(myVehicle: string): string[] {
    const myCap = capacityOf(myVehicle, '1t');
    return VEHICLE_OPTIONS.filter(v => (VEHICLE_CAPACITY[v] ?? Infinity) <= myCap);
}

/**
 * [합짐 기준] 이미 실은 짐을 빼고 남은 공간에 추가로 실을 수 있는 콜 등급 목록.
 *
 * 남은 용량 = 내 차 용량 − Σ(실은 짐들의 용량)
 * 오토바이(0점)는 조수석 적재라 남은 용량과 무관하게 항상 허용된다.
 *
 * 예: 1t 트럭 + 오토바이 1건  → 남은 30 → 전 차종 허용 (짐칸을 안 먹었으므로)
 * 예: 1t 트럭 + 라보 1건      → 남은 15 → 오토바이·승용차·다마스·라보
 * 예: 1t 트럭 + 라보 2건      → 남은  0 → 오토바이만
 * 예: 1t 트럭 + 1t 1건        → 남은  0 → 오토바이만
 *
 * ⚠️ 반드시 "확정된 활성 콜 전부"를 넘길 것. 첫 짐 하나만 넘기면 남은 공간을 알 수 없다.
 *
 * @param myVehicle       기사님 차종
 * @param loadedVehicles  현재 적재 중인(확정된) 콜들의 차종 배열
 */
export function getRemainingCapacityTypes(myVehicle: string, loadedVehicles: string[]): string[] {
    const myCap = capacityOf(myVehicle, '1t');
    const usedCap = loadedVehicles.reduce((sum, v) => sum + capacityOf(v, myVehicle), 0);
    const remaining = Math.max(0, myCap - usedCap);

    return VEHICLE_OPTIONS.filter(v => {
        const cap = VEHICLE_CAPACITY[v] ?? Infinity;
        if (cap === 0) return true;          // 오토바이: 조수석 적재, 상한 없음
        return cap <= remaining && cap <= myCap;
    });
}
