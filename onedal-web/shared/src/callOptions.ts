/**
 * 🎛️ **콜 옵션 — 화면의 선택지와 그 값이 사는 한 곳** (2026-08-20 신설)
 *
 * 기사님(2026-08-20): *"콜 옵션이 모두 들어가 있는 디폴트 값을 정의하는 테이블을
 * 만들 스키마를 만든다. 타입스크립트로도 만든다."*
 *
 * 🔴 **왜 필요한가** — 6단계 전수 조사(docs/기록/결정_이력.md)에서 드러났다:
 *    화면의 짐 관련 값 **열 중 아홉이 코드 상수**라 기사님이 못 바꾼다.
 *    단위·환산·차종 정원·상하차 방법·보호·후작업·성질이 전부 코드에 박혀 있다.
 *    규칙 ⑤-4 의 **①스키마가 빈 상태**이며, 그 값이 기사님이 1~2초에 누르는 색을 정한다.
 *
 * 🔴 **아직 아무도 이 표를 안 쓴다.** 지금은 **테이블을 만들고 채우기만** 한다 —
 *    화면·판정은 여전히 옛 상수로 돈다. 연결은 다음 단계에서, 값이 같은지 확인한 뒤에.
 *    (`judgment.ts` 의 원칙: *"구조를 바꾸는 일과 값을 바꾸는 일을 같이 하지 않는다"*)
 *
 * ⚠️ **기본값은 옛 상수를 그대로 읽어서 만든다** (`buildDefaultCallOptions`).
 *    손으로 옮겨 적으면 오타 하나로 두 값이 갈리고, 화면과 판정이 다른 숫자를 본다.
 */

import { CARGO_UNITS, CARGO_UNIT_POINTS, PROTECTION_MINUTES, AFTERWORK_MINUTES,
         DEFAULT_PROTECTIONS, DEFAULT_AFTERWORKS } from './cargoUnits';
import { CARGO_TAGS } from './cargoTags';
import { VEHICLE_CAPACITY, VEHICLE_OPTIONS } from './vehicles';
import { DWELL_BASE, DWELL_PER_POINT, DEFAULT_DEADLINE_RULES } from './timing';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 갈래
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 🔴 **한 테이블에 다 담는다** (기사님 지시). 갈래마다 테이블을 나누면
 *    컬럼이 크게 겹치고, 갈래가 하나 늘 때마다 스키마가 늘어난다.
 *    `stop_cargo_reports` 가 이미 같은 방식이다 (`stopType`+`kind` 로 구분).
 */
export const CALL_OPTION_CATEGORIES = [
    'unit',        // 짐 단위 (파레트 · 라면박스 …)
    'vehicle',     // 차종 (1t · 라보 …)
    'handling',    // 상하차 방법 (지게차 · 수작업)
    'protection',  // 🔒 보호 — 상차 전용 (결박 · 호루 …)
    'afterwork',   // 🧹 후작업 — 하차 전용 (정리 · 검수)
    'tag',         // 짐 성질 (일반화물 · 농산물 …)
    'timing',      // 시간 규칙 (도착 약속 여유 …)
] as const;
export type CallOptionCategory = typeof CALL_OPTION_CATEGORIES[number];

/**
 * 🔑 **갈래마다 `num1`·`num2`·`refKey` 가 무엇인지** — 이 표가 유일한 설명이다.
 *
 * | 갈래 | num1 | num2 | refKey |
 * |---|---|---|---|
 * | `unit`       | 라면박스 환산 (파레트 = 40) | — | — |
 * | `vehicle`    | 정원 (박스) | 기본 수량 | 기본 단위 |
 * | `handling`   | 기본 분 | **박스당 분** | — |
 * | `protection` | 분 | — | — |
 * | `afterwork`  | 분 | — | — |
 * | `tag`        | — | — | — |
 * | `timing`     | 분 | — | — |
 *
 * ⚠️ `vehicle` 의 기본 수량·단위는 지금 코드에서는 **함수가 계산한다**
 *    (`defaultCargoByVehicle` — 정원 ÷ 파레트 환산). 표로 옮기면 **기사님이 직접 고칠 수 있다** —
 *    *"1t 인데 파레트 2개 말고 3개로 잡고 싶다"* 같은 것이 가능해진다.
 */
export interface CallOption {
    category: CallOptionCategory;
    /** 값의 이름 = 화면의 선택지 값 (`파레트` · `1t` · `지게차` · `arrival_margin`) */
    key: string;
    /** 화면에 보이는 글자. 대개 `key` 와 같지만 `timing` 은 다르다 */
    label: string;
    /** 주 값 — 갈래마다 뜻이 다르다 (위 표) */
    num1: number | null;
    /** 보조 값 — `handling` 의 박스당 분 · `vehicle` 의 기본 수량 */
    num2: number | null;
    /** 다른 옵션을 가리킨다 — `vehicle` 의 기본 단위 (`파레트`) */
    refKey: string | null;
    /** 숫자의 단위 (`박스` · `분` · `분/박스`) — 화면이 그대로 쓴다 */
    unitLabel: string;
    /** 화면에 놓이는 순서 */
    sortOrder: number;
    /** 선택지에 띄울 것인가 — 끄면 화면에서 사라진다 (옛 단위를 숨길 때) */
    enabled: boolean;
    /** 미리 눌러 둘 것인가 (`결박` · `정리` — 규칙: 빈칸으로 기다리지 않는다) */
    isDefault: boolean;
    /** 기사님이 고칠 수 있는 범위 — 폼이 그대로 쓴다 */
    minValue: number | null;
    maxValue: number | null;
    /** **왜 이 값인가.** 폼의 칸 아래 그대로 뜬다 (`judgment.ts` 와 같은 규약) */
    why: string;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// DB 컬럼 — `db.ts` 가 이 목록으로 테이블을 만든다
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** `CallOption` 필드 ↔ DB 컬럼. **여기만 고치면 DDL 이 따라온다** */
export const CALL_OPTION_COLUMNS: ReadonlyArray<[keyof CallOption, string, string]> = [
    ['category',   'category',   'TEXT NOT NULL'],
    ['key',        'key',        'TEXT NOT NULL'],
    ['label',      'label',      'TEXT NOT NULL'],
    ['num1',       'num1',       'REAL'],
    ['num2',       'num2',       'REAL'],
    ['refKey',     'ref_key',    'TEXT'],
    ['unitLabel',  'unit_label', 'TEXT NOT NULL DEFAULT \'\''],
    ['sortOrder',  'sort_order', 'INTEGER NOT NULL DEFAULT 0'],
    ['enabled',    'enabled',    'INTEGER NOT NULL DEFAULT 1'],
    ['isDefault',  'is_default', 'INTEGER NOT NULL DEFAULT 0'],
    ['minValue',   'min_value',  'REAL'],
    ['maxValue',   'max_value',  'REAL'],
    ['why',        'why',        'TEXT NOT NULL DEFAULT \'\''],
];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 기본값 — **옛 상수에서 그대로 읽는다**
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const opt = (o: Partial<CallOption> & Pick<CallOption, 'category' | 'key'>): CallOption => ({
    label: o.key, num1: null, num2: null, refKey: null, unitLabel: '',
    sortOrder: 0, enabled: true, isDefault: false,
    minValue: null, maxValue: null, why: '', ...o,
});

/**
 * 🌱 **시딩용 기본값.** 손으로 적지 않고 **지금 코드가 쓰는 상수를 그대로 읽는다** —
 *    베끼는 것이 아니라 복사하는 것이라 값이 어긋날 수가 없다.
 *
 * → 그래서 기사님 계획의 3번(*"화면의 디폴트 값이 모두 매칭되는지 확인"*)이
 *   **저절로 보장된다.** 남는 확인은 *"빠진 항목이 없는가"* 하나뿐이다.
 */
export function buildDefaultCallOptions(): CallOption[] {
    const out: CallOption[] = [];

    // ── 짐 단위 — 라면박스가 축이다 (용어집 §5)
    CARGO_UNITS.forEach((u, i) => out.push(opt({
        category: 'unit', key: u, num1: CARGO_UNIT_POINTS[u] ?? null,
        unitLabel: '박스', sortOrder: i, minValue: 0, maxValue: 200,
        why: u === '기타' ? '부피를 모른다는 뜻 — 0 은 "안 실었다"가 아니라 "환산할 수 없다"'
                          : `라면박스 ${CARGO_UNIT_POINTS[u]}개 분량`,
    })));

    // ── 차종 — 정원과 **기본으로 눌러 둘 짐**
    //    지금은 `defaultCargoByVehicle` 이 정원에서 계산한다. 표로 옮기면 기사님이 직접 고친다.
    VEHICLE_OPTIONS.forEach((v, i) => {
        const boxes = VEHICLE_CAPACITY[v] ?? null;
        const perPallet = CARGO_UNIT_POINTS['파레트'];
        const 파레트로 = boxes != null && boxes >= perPallet * 2;
        out.push(opt({
            category: 'vehicle', key: v, num1: boxes,
            num2: boxes == null ? null : (파레트로 ? Math.round(boxes / perPallet) : boxes),
            refKey: 파레트로 ? '파레트' : '라면박스',
            unitLabel: '박스', sortOrder: i, minValue: 0, maxValue: 3000,
            why: '통화 전에 이 분량을 미리 눌러 둔다 (규칙 ⑤-2)',
        }));
    });

    // ── 상하차 방법 — `기본 분 + 박스당 분 × 박스 수`
    Object.keys(DWELL_PER_POINT).forEach((h, i) => out.push(opt({
        category: 'handling', key: h,
        num1: DWELL_BASE[h] ?? 0, num2: DWELL_PER_POINT[h] ?? null,
        unitLabel: '분/박스', sortOrder: i, minValue: 0, maxValue: 10,
        why: h === '지게차' ? '박스당 3초 — 파레트(40박스) 2분'
                            : '박스당 20초 — 다마스 30박스 10분',
    })));

    // ── 🔒 보호 (상차 전용) · 🧹 후작업 (하차 전용)
    Object.entries(PROTECTION_MINUTES).forEach(([k, m], i) => out.push(opt({
        category: 'protection', key: k, num1: m, unitLabel: '분', sortOrder: i,
        minValue: 0, maxValue: 120,
        isDefault: (DEFAULT_PROTECTIONS as readonly string[]).includes(k),
        why: k === '결박' ? '방법과 무관하게 무조건 — 기본으로 눌려 있다' : '고른 것의 합을 상차 시간에 더한다',
    })));
    Object.entries(AFTERWORK_MINUTES).forEach(([k, m], i) => out.push(opt({
        category: 'afterwork', key: k, num1: m, unitLabel: '분', sortOrder: i,
        minValue: 0, maxValue: 240,
        isDefault: (DEFAULT_AFTERWORKS as readonly string[]).includes(k),
        why: k === '정리' ? '하차하면 무조건 한다 — 기본으로 눌려 있다' : '검수는 하차할 때 하는 일이다',
    })));

    // ── 짐 성질 — 숫자가 없다. 목록과 순서만
    (CARGO_TAGS as readonly string[]).forEach((t, i) => out.push(opt({
        category: 'tag', key: t, sortOrder: i, why: '같이 실을 수 있나·취급 주의를 가른다',
    })));

    // ── 시간 규칙
    out.push(opt({
        category: 'timing', key: 'arrival_margin', label: '도착 약속 여유',
        num1: DEFAULT_DEADLINE_RULES.arrivalMarginMinutes ?? 30,
        unitLabel: '분', sortOrder: 0, minValue: 0, maxValue: 120,
        why: '통화 전 추정 약속 = 도착 예상 + 이만큼 (기사님 2026-08-18)',
    }));
    out.push(opt({
        category: 'timing', key: 'pickup_offset', label: '상차 마감 폴백',
        num1: DEFAULT_DEADLINE_RULES.pickupOffsetMinutes ?? 60,
        unitLabel: '분', sortOrder: 1, minValue: 0, maxValue: 240,
        why: '접근 주행을 모를 때만 쓰는 옛 규칙 (콜 잡은 시각 + 이만큼)',
    }));
    out.push(opt({
        category: 'timing', key: 'rest_margin', label: '휴게 여유',
        num1: DEFAULT_DEADLINE_RULES.restMarginMinutes ?? 30,
        unitLabel: '분', sortOrder: 2, minValue: 0, maxValue: 240,
        why: '하차 약속 = 상차 완료 + 주행 + 이만큼',
    }));

    return out;
}

/** 갈래별로 묶어서 준다 — 화면이 선택지를 그릴 때 쓴다 */
export function groupCallOptions(list: CallOption[]): Record<CallOptionCategory, CallOption[]> {
    const out = {} as Record<CallOptionCategory, CallOption[]>;
    for (const c of CALL_OPTION_CATEGORIES) out[c] = [];
    for (const o of list) out[o.category]?.push(o);
    for (const c of CALL_OPTION_CATEGORIES) out[c].sort((a, b) => a.sortOrder - b.sortOrder);
    return out;
}

/**
 * ⏱️ **정차 값의 원천은 이 표다** (기사님 확정 2026-08-29 · 그릇을 가른 뒤)
 *
 * ── 왜 여기인가 ──
 *
 * 2026-08-29 낮에 「지게차 박스당」·「수작업 박스당」·「검수 분」을 **판정 기준 탭**으로
 * 올렸다. 그런데 그 셋은 **화면의 칩에 붙는 숫자**다 — 통화 시트가 「수작업 10분」·
 * 「검수 60분」이라고 그리는 그 값. 판정은 그걸 **쓰는** 쪽이지 정하는 쪽이 아니다.
 *
 * 게다가 이 표에는 **이미 그 칸이 있었다** (`handling.num2` · `afterwork.num1`).
 * 판정 기준 탭에 또 만든 것은 **같은 값을 두 그릇에 담은 것**이다 (규칙 ③).
 *
 * ```
 * 판정 기준 탭  →  «어떻게 잴 것인가»          가중치 · 색 경계 · 목표 시급 · 여유 곡선
 * 콜 옵션 표    →  «무엇을 고를 수 있고 몇 분인가»  칩과 그 숫자      ← 정차 값은 여기
 * ```
 *
 * 🔴 **표가 비어 있으면 `undefined` 를 준다** — 그때는 `timing.ts` 의 옛 상수로 돈다
 *    (되돌리는 길). 값을 지어내지 않는다 (규칙 ④).
 */
export function dwellRatesOf(options: readonly CallOption[]): {
    perBoxMin?: { forkliftMin: number; manualMin: number };
    afterworkMin?: Record<string, number>;
} {
    const 방법 = options.filter(o => o.category === 'handling');
    const 지게차 = 방법.find(o => o.key === '지게차')?.num2;
    const 수작업 = 방법.find(o => o.key === '수작업')?.num2;

    const 후작업 = options.filter(o => o.category === 'afterwork' && o.num1 != null);
    const afterworkMin = 후작업.length
        ? Object.fromEntries(후작업.map(o => [o.key, o.num1 as number]))
        : undefined;

    return {
        ...(지게차 != null && 수작업 != null
            ? { perBoxMin: { forkliftMin: 지게차, manualMin: 수작업 } } : {}),
        ...(afterworkMin ? { afterworkMin } : {}),
    };
}
