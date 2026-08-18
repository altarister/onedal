/**
 * [Phase 8.4] 화물 단위와 상하차 소요 시간
 *
 * 기사님:
 *   *"상차지 통화 시 대략적으로 부피를 유추할 수 있어야 해. 그래서 일반적인 단위가 필요할 듯한데,
 *     1톤 화물이면 **파레트**가 기본적일 거고 그렇지 않다면 **라면박스 몇 개** 이렇게 표시할 수 있을 듯."*
 *   *"하차지 통화 시 물건의 크기와 부피 성질은 이미 파악된 상태이고 **시간과 상하차 방법만** 관심사."*
 *   *"수작업을 하면 상하차 시간이 많이 걸릴 거고, 지게차로 하면 많이 줄 거야."*
 *
 * 그래서 두 가지를 바꾼다.
 *   ① 추상적인 소·중·대 대신 **기사님이 통화에서 실제로 쓰는 단위**(파레트·라면박스·마대)를 앞에 둔다
 *   ② 상하차 방법을 **소요 시간(분)** 으로 환산해 경로 시간에 더한다
 */
import { VEHICLE_CAPACITY, normalizeVehicleType } from './vehicles';
import type { HandlingMethod } from './index';

/**
 * 적재 단위 — **기사님이 통화에서 실제로 쓰는 말**을 그대로 쓴다.
 *
 * 처음에는 소·중·대·초과로 만들었는데 기사님이 *"직관적이지 않다"* 고 했다. 맞다.
 * "중간 크기"는 사람마다 다르지만 "마대 1개"는 누구에게나 같다.
 *
 * 실제 `local.db` 적요에 등장한 품목이 근거다:
 *   `마대 1개` · `박스 1개` · `샘플 박스` · `서류봉투` · `소형 가전` · `쇼핑백 2개`
 *
 * 🔴 점수는 **라면박스 축** — 1박스 = 1점 (기사님 확정 2026-08-17 · 용어집 §5가 원천).
 *    내 1t 트럭 = 100박스 (`TRUCK_CAPACITY_SLOTS`) · 1t짐 = 파레트 2개 = 80박스.
 */
// '가전' 은 단위가 아니라 **성질**이다 (cargoTags). 냉장고와 전기면도기가 같은 부피일 리 없다.
//
// [2026-08-12] 기사님 결정 — 톤백·쇼핑백을 선택지에서 빼고 `기타` 를 넣었다.
// 화면에서는 **다섯 개를 한 번에** 보여준다 ('기타 ▸' 더보기를 없앴다).
export const CARGO_UNITS = [
    '파레트', '라면박스', '마대', '서류봉투', '기타',
] as const;

/**
 * 선택지에서는 뺐지만 **읽을 수는 있어야 하는** 옛 단위.
 *
 * 🔴 지우면 안 된다. `local.db` 에 톤백 3건·쇼핑백 2건이 실제로 남아 있고,
 *    적요 파서(`cargoHints`)도 "톤백"·"쇼핑백" 이라는 낱말을 읽는다.
 *    점수표에서 빼면 그 콜들의 부피가 0 이 되어 **차종 추정으로 떨어진다** —
 *    이미 아는 정보를 버리는 셈이다. (`sizeClass` 를 폴백으로 남긴 것과 같은 이유)
 */
export const LEGACY_CARGO_UNITS = ['톤백', '쇼핑백'] as const;

export type CargoUnit = typeof CARGO_UNITS[number] | typeof LEGACY_CARGO_UNITS[number];

export const CARGO_UNIT_POINTS: Record<CargoUnit, number> = {
    '파레트': 40,    // 박스 40개 분량 — 2개(80) + 여유 20 = 1t 만재 (용어집 §5)
    '마대': 1,       // 박스 1개 (예전 4개에서 기사님이 1로 정정)
    '라면박스': 1,   // 축의 기준 — 라면 40개들이 1박스
    '서류봉투': 0.2,  // 무게·부피 거의 없음 (용어집 §5)
    /**
     * `기타` 는 **부피를 모른다는 뜻**이다. 0 점을 주는 것은 "안 실었다"가 아니라
     * "환산할 수 없다"는 표시다 — `cargoPoints` 가 0 이면 적재 계산이
     * **차종 기준 보수 추정(ESTIMATED)** 으로 떨어진다. 그게 정직한 값이다.
     * 없는 숫자를 지어내면 합짐 판정이 조용히 틀어진다.
     */
    '기타': 0,
    // ── 아래는 옛 데이터·적요 해석용 (선택지에는 없다) ──
    '톤백': 40,      // 박스 40개 분량 — 만재가 아니다 (예전 '만재 30점'에서 기사님이 정정)
    '쇼핑백': 0.2,   // 쌓아올리기 어려운 백 (용어집 §5)
};

/**
 * 수량을 어떻게 입력받을 것인가.
 *
 * 기사님: *"수량은 파레트는 3개까지만 표시. 라면박스, 마대 등 나머지는
 * 10단위 1단위로 두 번 클릭으로 입력할 수 있도록."*
 *
 * 파레트는 1t 에 두 개면 만재라 3 을 넘길 일이 없다.
 * 라면박스는 수십 개가 예사라 프리셋으로는 못 맞춘다 — 자릿수로 받는다.
 */
export type QuantityInput =
    | { mode: 'preset'; options: number[] }
    /** 십의 자리 + 일의 자리를 각각 눌러 더한다 (0~59) */
    | { mode: 'digits'; tens: number[]; ones: number[] }
    /** 세는 것이 의미 없다 (부피를 모르는 `기타`) */
    | { mode: 'none' };

const DIGITS: QuantityInput = {
    mode: 'digits',
    tens: [0, 10, 20, 30, 40, 50],
    ones: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
};

export const CARGO_UNIT_QUANTITY_INPUT: Record<CargoUnit, QuantityInput> = {
    '파레트': { mode: 'preset', options: [1, 2, 3] },
    '라면박스': DIGITS,
    '마대': DIGITS,
    '서류봉투': DIGITS,
    '기타': { mode: 'none' },
    '톤백': { mode: 'preset', options: [1, 2] },
    '쇼핑백': DIGITS,
};

export function unitPoints(unit?: string | null, quantity?: number | null): number {
    if (!unit) return 0;
    const p = CARGO_UNIT_POINTS[unit as CargoUnit];
    if (p == null) return 0;
    return p * (quantity || 1);
}

/**
 * 🚚 **차종이 곧 기본 짐** — 통화 전 미리 눌러 둘 단위·수량 (기사님 확정 2026-08-18).
 *
 * 서버는 이미 신고가 없으면 `VEHICLE_CAPACITY[차종]` 을 적재로 잡는다
 * (`computeLoadedPoints` — 1t 첫짐 하나에 slotsUsed 80 이 나오던 값이 이것이다).
 * 그런데 통화 시트는 빈칸이라 **화면과 서버가 다른 값을 보고 있었다.**
 * 같은 값을 화면에도 눌러 둔다 — 미리 눌러 두고 기사님이 틀린 것만 고치는 방식.
 *
 * 🔴 순서는 **적요 > 차종 기본값**. 적요에 `카톤 10박스` 가 있으면 그것이 이긴다 —
 *    적요는 이 콜의 실제 정보이고, 차종은 그 차 한 대 분량이라는 짐작일 뿐이다.
 */
export function defaultCargoByVehicle(vehicleType?: string | null):
    { unit: CargoUnit; quantity: number; handling: HandlingMethod } | null {
    const v = normalizeVehicleType(vehicleType || '');
    if (!v) return null;
    const boxes = VEHICLE_CAPACITY[v];
    if (!boxes) return null;
    // 1t 이상은 파레트로 센다 (용어집 §5: 1t짐 = 파레트 2개 = 박스 80개)
    const perPallet = CARGO_UNIT_POINTS['파레트'];
    if (boxes >= perPallet * 2) {
        // 🔴 **파레트면 지게차다** (기사님 2026-08-18): *"파레트를 사람 손으로 내리기는 너무 어려우니까."*
        //    나머지는 수작업 — 신고 데이터의 최빈값이기도 하다 (수작업 44 · 지게차 12, 규칙 ⑤-2).
        return { unit: '파레트', quantity: Math.round(boxes / perPallet), handling: '지게차' };
    }
    return { unit: '라면박스', quantity: boxes, handling: '수작업' };
}

/**
 * 🔒 **보호 — 짐을 고정·보호하는 데 드는 시간** (기사님 확정 2026-08-18)
 *
 * 방법(`HANDLING_METHODS`)과 축이 다르다. 방법은 *"짐을 손으로 내리거나 싣는 행위만"* 이고,
 * 보호는 그 뒤에 붙는 안전 조치다. 예전에는 이 둘이 섞여 있었다 —
 * 수작업 15분 주석이 *"찾기 + 상차 + **결박**"* 이었다.
 * 기사님: *"그때는 안전이라는 값이 없었으니 그냥 두리뭉실 넣은 값이야."*
 *
 * **성질(tags)처럼 복수 선택**이고 고른 것의 분(分)을 더한다.
 * 🔴 **결박은 방법과 무관하게 무조건 붙는다** — *"파레트를 선택하더라도 결박은 무조건"*.
 */
export const PROTECTION_MINUTES = {
    '호루': 3,
    '결박': 4,
    '그물망': 1,
    '탑박스': 1,
} as const;
export const PROTECTIONS = Object.keys(PROTECTION_MINUTES) as Protection[];
export type Protection = keyof typeof PROTECTION_MINUTES;
/** 통화 전 미리 눌러 두는 값 — 결박은 늘 한다 */
export const DEFAULT_PROTECTIONS: Protection[] = ['결박'];

/** 고른 보호들의 합(분). 모르면 0 — 지어내지 않는다 */
export function protectionMinutes(list?: readonly string[] | null): number {
    if (!list?.length) return 0;
    return list.reduce((sum, p) => sum + (PROTECTION_MINUTES[p as Protection] ?? 0), 0);
}

/**
 * 🧹 **후작업 — 짐을 내린 뒤에 하는 일** (기사님 확정 2026-08-18)
 *
 * 기사님: *"검수는 하차할 때 하는 거라 하차로 옮기는 것이 맞을 듯.
 * 카테고리는 후작업 이렇게 넣고 정리 1분, 검수 60분 이렇게 추가해줘."*
 *
 * 보호(상차)와 짝이다 — **묶는 일은 상차, 푸는 뒤의 일은 하차**.
 * 성질·보호처럼 **복수 선택**이고 고른 것의 분을 하차 시간에 더한다.
 */
export const AFTERWORK_MINUTES = {
    '정리': 1,
    '검수': 60,
} as const;
export const AFTERWORKS = Object.keys(AFTERWORK_MINUTES) as Afterwork[];
/**
 * 통화 전 미리 눌러 두는 값 — **정리는 무조건 한다** (기사님 2026-08-18).
 * 보호의 `결박` 과 같은 성격이다: 고를지 말지가 아니라 늘 있는 일이다.
 */
export const DEFAULT_AFTERWORKS: Afterwork[] = ['정리'];
export type Afterwork = keyof typeof AFTERWORK_MINUTES;

/** 고른 후작업들의 합(분). 모르면 0 — 지어내지 않는다 */
export function afterworkMinutes(list?: readonly string[] | null): number {
    if (!list?.length) return 0;
    return list.reduce((sum, a) => sum + (AFTERWORK_MINUTES[a as Afterwork] ?? 0), 0);
}
