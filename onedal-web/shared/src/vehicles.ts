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
 * 차종별 적재 점수 — **라면박스 단위**다 (아래 표 참조).
 * ⚠️ 예전엔 "1t 트럭 = 30점 기준"이라 적혀 있었는데 **옛 5칸/30점 축**이다.
 *    지금은 1t 짐 80박스 · 내 트럭 100박스(TRUCK_CAPACITY_SLOTS) 다 (2026-08-29 정정).
 *
 * 🔴 **라면박스 축** (기사님 확정 2026-08-17 · docs/지금/용어집.md §5·§7이 원천):
 *   표시 차종 X 의 콜 = X 한 대 분량의 짐. 1t 짐만 예외로 **80박스**(파레트 2개) —
 *   내 트럭 용량(TRUCK_CAPACITY_SLOTS = 100박스)과 다르다. 자투리 20박스가 안전 여유.
 *   오토바이 짐 = 1박스 (옛 "조수석 0점·상한 없음" 규칙은 폐기 — 용어집 확정).
 *   1t 초과 차종은 톤당 100박스 비례 (어차피 내 차에 안 실리므로 정밀도 무의미).
 *
 * ⚠️ VEHICLE_OPTIONS 배열 순서에 의존하지 말 것 — UI 드롭다운 표시용이다.
 */
export const VEHICLE_CAPACITY: Record<string, number> = {
    '오토바이': 1,
    '승용차': 5,
    '다마스': 30,
    '라보': 40,
    '1t': 80,
    '1.4t': 140,
    '2.5t': 250,
    '3.5t': 350,
    '5t': 500,
    '11t': 1100,
    '25t': 2500,
    '특수화물': 2500,
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
 * 남은 용량 = 내 차 용량(1t = 100박스) − Σ(실은 짐들의 박스)
 * 오토바이 짐도 1박스를 차지한다 (기사님 확정 2026-08-17 — 옛 "조수석 0점" 규칙 폐기).
 *
 * 예: 1t 트럭 + 오토바이 1건  → 남은 99 → 전 차종 허용
 * 예: 1t 트럭 + 라보 1건      → 남은 60 → 오토바이·승용차·다마스·라보
 * 예: 1t 트럭 + 라보 2건      → 남은 20 → 오토바이·승용차 (자투리에 낱짐은 실린다)
 * 예: 1t 트럭 + 1t짐 1건      → 남은 20 → 오토바이·승용차
 *
 * ⚠️ 반드시 "확정된 활성 콜 전부"를 넘길 것. 첫 짐 하나만 넘기면 남은 공간을 알 수 없다.
 *
 * @param myVehicle       기사님 차종
 * @param loadedVehicles  현재 적재 중인(확정된) 콜들의 차종 배열
 */
export function getRemainingCapacityTypes(myVehicle: string, loadedVehicles: string[]): string[] {
    const usedCap = loadedVehicles.reduce((sum, v) => sum + capacityOf(v, myVehicle), 0);
    return typesFittingIn(myVehicle, usedCap);
}

/**
 * 적재 점수를 **직접** 넘겨 남은 공간에 들어갈 차종을 구한다.
 *
 * `getRemainingCapacityTypes` 는 차종만 보고 "1t 콜이면 80박스를 먹는다"고 **추정**한다.
 * 하지만 1t 콜이라도 실제 짐이 박스 1개면 1박스밖에 안 먹는다.
 * 통화나 현장 확인으로 실제 짐 양을 알게 되면 이 함수로 정확하게 계산한다.
 * → 만재로 오인해서 놓치던 합짐 기회가 열린다.
 */
export function getRemainingCapacityTypesByPoints(myVehicle: string, usedPoints: number): string[] {
    return typesFittingIn(myVehicle, usedPoints);
}

/**
 * 내 차 용량에서 usedCap 을 뺀 나머지에 들어갈 차종 목록.
 *
 * 🔴 **내 차의 그릇(용량)과 그 차종 콜의 짐은 다른 값이다** (2026-08-17 라면박스 축부터).
 *    1t 트럭의 그릇 = 100박스(`TRUCK_CAPACITY_SLOTS`) · "1t" 콜의 짐 = 80박스(파레트 2개).
 *    옛 30점 축에서는 한 표가 둘을 겸했지만 이제 갈라졌다 — 여기서 그릇을 짐 표로 읽으면
 *    내 용량이 80이 되어 자투리 20박스를 영영 못 쓴다.
 */
function typesFittingIn(myVehicle: string, usedCap: number): string[] {
    const myCap = normalizeVehicleType(myVehicle) === '1t'
        ? TRUCK_CAPACITY_SLOTS                    // 내 1t 트럭의 그릇 = 100박스
        : capacityOf(myVehicle, '1t');            // 다른 차주는 베타 이후 — 짐 표로 근사
    const remaining = Math.max(0, myCap - usedCap);

    return VEHICLE_OPTIONS.filter(v => {
        const cap = VEHICLE_CAPACITY[v] ?? Infinity;
        return cap <= remaining && cap <= myCap;
    });
}

/** 적재 점수의 확신도 — 관제탑에 그대로 표시해 기사님이 위험을 알 수 있게 한다 */
export type CapacityConfidence = 'ESTIMATED' | 'DECLARED' | 'CONFIRMED';

export const CAPACITY_CONFIDENCE_LABEL: Record<CapacityConfidence, string> = {
    ESTIMATED: '추정',   // 차종만 보고 계산 — 현장에서 안 들어갈 수 있다
    DECLARED: '신고',    // 통화로 들은 짐 양
    CONFIRMED: '확정',   // 현장에서 눈으로 확인
};

/**
 * 내 트럭(1t)의 총 적재 용량 — **라면박스 100개** (기사님 확정 2026-08-17).
 * 파레트 2개(80박스) + 여유 20박스. 용어집 §7이 원천.
 * (식별자의 SLOTS 는 역사적 이름 — 값의 단위는 박스다. 용어집 §9 "적재 용량" 키 유지 결정)
 */
export const TRUCK_CAPACITY_SLOTS = 100;

/**
 * 잡은 콜들의 명목 사용 칸 합계.
 *
 * "명목"이다 — 표시 차종 기준. 통화로 실짐이 확인되면(DECLARED/CONFIRMED)
 * 점수 기반 경로(getRemainingCapacityTypesByPoints)가 더 정확하므로 그쪽을 쓴다.
 * 모르는 차종은 보수적으로 1t짐(80박스)으로 센다.
 */
export function slotsUsedOf(vehicleTypes: Array<string | null | undefined>): number {
    return vehicleTypes.reduce((sum: number, v) => {
        if (!v) return sum + VEHICLE_CAPACITY['1t'];                       // 모르면 1t짐(80박스)으로 보수적으로
        const boxes = VEHICLE_CAPACITY[normalizeVehicleType(v) ?? ''];
        return sum + (boxes !== undefined ? boxes : VEHICLE_CAPACITY['1t']);
    }, 0);
}
