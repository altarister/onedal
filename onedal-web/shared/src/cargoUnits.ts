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

/**
 * 적재 단위 — **기사님이 통화에서 실제로 쓰는 말**을 그대로 쓴다.
 *
 * 처음에는 소·중·대·초과로 만들었는데 기사님이 *"직관적이지 않다"* 고 했다. 맞다.
 * "중간 크기"는 사람마다 다르지만 "마대 1개"는 누구에게나 같다.
 *
 * 실제 `local.db` 적요에 등장한 품목이 근거다:
 *   `마대 1개` · `박스 1개` · `샘플 박스` · `서류봉투` · `소형 가전` · `쇼핑백 2개`
 *
 * 점수는 `1t = 30점` 축 (`VEHICLE_CAPACITY` 와 같다).
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
    '파레트': 15,    // 1t 트럭에 2개면 만재 — 실무 감각
    '마대': 1,       // 라면박스 4개 정도의 부피
    '라면박스': 0.25,// 120개가 1t
    '서류봉투': 0.02, // 사실상 공간을 먹지 않는다
    /**
     * `기타` 는 **부피를 모른다는 뜻**이다. 0 점을 주는 것은 "안 실었다"가 아니라
     * "환산할 수 없다"는 표시다 — `cargoPoints` 가 0 이면 적재 계산이
     * **차종 기준 보수 추정(ESTIMATED)** 으로 떨어진다. 그게 정직한 값이다.
     * 없는 숫자를 지어내면 합짐 판정이 조용히 틀어진다.
     */
    '기타': 0,
    // ── 아래는 옛 데이터·적요 해석용 (선택지에는 없다) ──
    '톤백': 30,      // 1톤짜리 대형 마대 하나면 1t 만재
    '쇼핑백': 0.1,
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

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 상하차 소요 시간 (dwell time)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 상하차에 걸리는 시간(분).
 *
 * 🔴 지금까지 경로 시간은 **주행 시간만** 셌다. 수작업 상하차 두 번이면 한 시간이 그냥 사라지는데
 *    그걸 무시하고 "우회 +20분이면 양호"라고 판정했다. 실제로는 +20분이 아니라 +80분이었다.
 *
 * 기본 시간 + 짐 양에 비례하는 시간으로 잡는다.
 *   지게차 + 파레트 2개(30점)  → 10 + 30×0.3 = 19분
 *   수작업 + 라면박스 40개(10점) → 15 + 10×1.5 = 30분
 *   수작업 + 파레트 2개(30점)   → 15 + 30×1.5 = 60분   (수작업으로 파레트는 정말 오래 걸린다)
 */
const DWELL_BASE: Record<string, number> = { '지게차': 10, '수작업': 15, '호이스트': 20, '검수': 90 };
/**
 * 🔴 `검수` 는 0 이다 (기사님 지시: "검수는 90분"). 물건을 하나하나 확인받는 자리라
 *    수량이 아니라 **절차**가 시간을 먹는다. 여기를 비워 두면 아래 `?? 1` 폴백이
 *    점수당 1분을 붙여 파레트 2개에 120분이 되어 버린다 — 반드시 명시한다.
 */
const DWELL_PER_POINT: Record<string, number> = { '지게차': 0.3, '수작업': 1.5, '호이스트': 1.0, '검수': 0 };

/** 방법을 모를 때 쓰는 값. 낙관하지 않는다 — 수작업일 수도 있다 */
export const DWELL_UNKNOWN_MINUTES = 20;

export function dwellMinutes(handling?: string | null, points = 0): number {
    if (!handling) return DWELL_UNKNOWN_MINUTES;
    const base = DWELL_BASE[handling];
    if (base == null) return DWELL_UNKNOWN_MINUTES;
    return Math.round(base + points * (DWELL_PER_POINT[handling] ?? 1));
}

export interface StopTiming {
    /** 상차 정차 시간(분) */
    pickupDwell: number;
    /** 하차 정차 시간(분) */
    dropoffDwell: number;
    /** 상차 + 하차 */
    totalDwell: number;
    /** 방법을 몰라 기본값으로 때운 정거장이 있는가 */
    hasUnknown: boolean;
}

/**
 * 한 콜의 상·하차 정차 시간.
 * 하차 방법을 따로 안 물었으면 상차와 같다고 본다 (지게차로 실었으면 대개 지게차로 내린다).
 */
export function computeStopTiming(
    pickup: { handling?: string | null; unit?: string | null; quantity?: number | null } | undefined,
    dropoff: { handling?: string | null } | undefined,
): StopTiming {
    const points = unitPoints(pickup?.unit, pickup?.quantity);
    const pickupDwell = dwellMinutes(pickup?.handling, points);
    const dropoffDwell = dwellMinutes(dropoff?.handling ?? pickup?.handling, points);
    return {
        pickupDwell,
        dropoffDwell,
        totalDwell: pickupDwell + dropoffDwell,
        hasUnknown: !pickup?.handling || !(dropoff?.handling ?? pickup?.handling),
    };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 시각 선택 — "몇 시까지 오시면 되요"
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 기사님: *"지금부터 몇 시간인지는 상하차지에서는 관심이 없고 **'몇 시까지 오시면 되요'**
 * 이것이 더 직관적일 듯. 그래서 버튼에 예상 시간이 표시되는 것이 좋을 듯."*
 *
 * 그래서 `[+2시간]` 이 아니라 `[16시]` 를 보여준다. 통화 상대가 말하는 그대로다.
 * 도착 예상 시각(주행+정차)을 넘겨주면 **가장 이른 현실적인 시각부터** 시작한다 —
 * 도착도 못 하는 시각을 고르게 두면 안 된다.
 */
export interface HourSlot {
    /** 정시 ISO */
    iso: string;
    /** 버튼에 찍을 글자 (예: "16시") */
    label: string;
    /** 지금 기준 몇 분 뒤인가 */
    minutesFromNow: number;
    /** 예상 도착보다 이른가 — 고르면 지각이 확정된다 */
    beforeEta: boolean;
}

export function buildHourSlots(nowMs: number, etaMinutes = 0, count = 5): HourSlot[] {
    const slots: HourSlot[] = [];
    const start = new Date(nowMs);
    start.setMinutes(0, 0, 0);

    let h = 1;
    while (slots.length < count && h <= 24) {
        const t = new Date(start.getTime() + h * 3600_000);
        const minutesFromNow = Math.round((t.getTime() - nowMs) / 60000);
        slots.push({
            iso: t.toISOString(),
            label: `${t.getHours()}시`,
            minutesFromNow,
            beforeEta: minutesFromNow < etaMinutes,
        });
        h++;
    }
    return slots;
}
