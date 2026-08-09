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
 *   ① 추상적인 소·중·대 대신 **기사님이 통화에서 실제로 쓰는 단위**(파레트/라면박스)를 앞에 둔다
 *   ② 상하차 방법을 **소요 시간(분)** 으로 환산해 경로 시간에 더한다
 */

/**
 * 적재 단위. 점수는 `1t = 30점` 축을 그대로 쓴다 (`VEHICLE_CAPACITY` 와 같은 축).
 *
 *   파레트 15점  → 1t 트럭에 2개면 만재. 실무 감각과 맞는다
 *   라면박스 0.25점 → 120개가 1t. 소량 화물의 기본 단위
 */
export const CARGO_UNITS = ['파레트', '라면박스', '소', '중', '대', '초과'] as const;
export type CargoUnit = typeof CARGO_UNITS[number];

export const CARGO_UNIT_POINTS: Record<CargoUnit, number> = {
    '파레트': 15,
    '라면박스': 0.25,
    '소': 2,
    '중': 5,
    '대': 10,
    '초과': 30,
};

/** 단위마다 자주 쓰는 수량이 다르다. 파레트는 1~3개, 라면박스는 수십 개 */
export const CARGO_UNIT_QUANTITIES: Record<CargoUnit, number[]> = {
    '파레트': [1, 2, 3],
    '라면박스': [5, 10, 20, 40, 60],
    '소': [1, 2, 3, 5, 10],
    '중': [1, 2, 3, 5],
    '대': [1, 2, 3],
    '초과': [1],
};

/** 상차지 통화에서 먼저 보여줄 단위 (1t 기사 기준) */
export const PICKUP_PRIMARY_UNITS: CargoUnit[] = ['파레트', '라면박스'];
export const PICKUP_SECONDARY_UNITS: CargoUnit[] = ['소', '중', '대', '초과'];

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
const DWELL_BASE: Record<string, number> = { '지게차': 10, '수작업': 15, '호이스트': 20 };
const DWELL_PER_POINT: Record<string, number> = { '지게차': 0.3, '수작업': 1.5, '호이스트': 1.0 };

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
