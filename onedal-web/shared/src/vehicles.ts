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
 *
 * 🔴 **라면박스 축** (기사님 확정):
 *   표시 차종 X 의 콜 = X 한 대 분량의 짐. 1t 짐만 예외로 **80박스**(파레트 2개) —
 *   내 트럭 용량(TRUCK_CAPACITY_SLOTS = 100박스)과 다르다. 자투리 20박스가 안전 여유.
 *   오토바이 짐 = 1박스 (용어집 확정).
 *   1t 초과 차종은 톤당 100박스 비례 (어차피 내 차에 안 실리므로 정밀도 무의미).
 *
 * ⚠️ VEHICLE_OPTIONS 의 순서는 UI 드롭다운 표시용이다 — 차종의 크고 작음은 이 표의 박스 수로 가른다.
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
    /**
     * 🚚 **배차망은 «톤»으로 적는다** — 화물24시 파서가 화면 글자를 원문 그대로 올린다
     *    («2.5톤/윙» · «1톤/카/윙»). 못 읽으면 적재도 상차 방법도 없어 **두 기준이 같이 죽는다**.
     *
     * 🔴 사전에 없는 톤수(«1.5톤»)는 그대로 `null` 이다 — 가까운 값으로 때우지 않는다 (규칙 ④).
     *
     * ⚠️ 앱에도 같은 다리가 있다 (`Hwamul24Parser` 의 «크로스 매칭»). **일부러 둔 두 벌**이다 —
     *    앱은 서버가 죽어도 콜을 걸러야 해서 자기 판단을 든다 (루트 README.md 규칙 ③ «앱의 기본값은 예외»).
     */
    const ton = /^(\d+(?:\.\d+)?)\s*톤(?:[/\s].*)?$/.exec(v);
    if (ton && VEHICLE_CAPACITY[`${ton[1]}t`] !== undefined) return `${ton[1]}t`;
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
 * 오토바이 짐도 1박스를 차지한다 (기사님 확정).
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
 * 🔴 **내 차의 그릇(용량)과 그 차종 콜의 짐은 다른 값이다** (라면박스 축부터).
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
 * 내 트럭(1t)의 총 적재 용량 — **라면박스 100개** (기사님 확정).
 * 파레트 2개(80박스) + 여유 20박스. 차종 표의 원천은 이 파일이다.
 *
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

/**
 * 🚚 **차종 짧은 이름** — 좁은 칸에 여럿을 적을 때 (`1t·다`).
 *    목업과 실물 필터가 **이 한 벌**을 쓴다 — 같은 글자를 써야 기사님이 목업에서 맞춰 두신 손맛이
 *    실물에서 다른 물건이 되지 않는다 (규칙 ③).
 */
export const VEHICLE_SHORT: Record<string, string> = {
    오토바이: '오', 승용차: '승', 다마스: '다', 라보: '라', '1t': '1t',
};

/** 🚚 **받을 짐에서 고를 수 있는 차종** — 목업과 같은 다섯, 같은 순서 */
export const VEHICLE_PICKS = ['오토바이', '승용차', '다마스', '라보', '1t'] as const;
