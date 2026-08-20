/**
 * 🪜 **여섯 단계, 여섯 테이블** (2026-08-20 신설)
 *
 * 기사님 구조: *"콜 KEEP → 테이블 생성 … ① 상차지 통화 [완료/스킵] → 상태값 변경 …"*
 * 기사님(2026-08-20): *"일단 나머지 테이블도 다 만들어 보자. 나중에 중복이라 여겨지면 그때 바꾸자."*
 *
 * 🔴 **행은 KEEP 때 생기고, 상태만 바뀐다.**
 *    지금 구조(`stop_cargo_reports`)는 *"행이 있다 = 했다"* 라 **계획을 담을 자리가 없고**,
 *    한 정거장이 최대 세 행(`SKIPPED`·`DECLARED`·`ACTUAL`)으로 흩어진다.
 *    → [전수 조사 §3~§5](../../../docs/단계_값_전수조사.md)
 *
 * ⚠️ **아직 아무도 안 읽는다.** 여섯을 다 만들어 **모양을 보고** 합칠지 정한다.
 *
 * ---
 * ## 컬럼이 단계마다 다른 이유
 *
 * | | 통화 | 도착 | 완료 |
 * |---|---|---|---|
 * | 짐 계획 | ⭕ 여기서 정한다 | ❌ | ⭕ |
 * | 짐 실측 | ❌ | ❌ | ⭕ **여기서만** |
 * | 약속 시각 | ⭕ **여기서만** | ❌ | ❌ |
 * | 사유 | ❌ (칩이 없다) | ⭕ | ⭕ |
 * | 예측 시각 | ❌ | ⭕ | ⭕ |
 *
 * ## ⚠️ `memo` 는 단계마다 **뜻이 다르다** (기사님 지적 2026-08-20)
 *
 * ```
 * 상차지 통화  "전화 받지 않음"     통화 시도의 결과      — 그때뿐
 * 상차 완료    "친절함"            사람·거래처 평가      — 🔴 다음에 또 갈 때도 유효
 * 하차 완료    "하차지 사람없음"    현장 상황            — 그때뿐
 * ```
 *
 * 🔴 *"친절함"* 은 **콜이 아니라 장소에 쌓여야 하는 값**이다 (`places` 테이블).
 *    지금은 그 콜의 메모에 묻혀 다음에 같은 곳을 만나도 안 보인다 (todo ⑤ 의 `이 곳 기록`).
 *    **아직 안 갈랐다** — 여섯을 만들어 본 뒤 함께 정한다.
 */

import type { CallStepId } from './callSteps';

export const STEP_STATUSES = ['PLANNED', 'DONE', 'SKIPPED'] as const;
export type StepStatus = typeof STEP_STATUSES[number];

/** `[필드, 컬럼, SQL 타입]` */
export type ColumnDef = readonly [string, string, string];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 컬럼 묶음 — 단계마다 골라 쓴다
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 여섯 단계가 **모두** 갖는 것 */
const BASE: ColumnDef[] = [
    ['status',     'status',      `TEXT NOT NULL DEFAULT 'PLANNED'`],
    /** 이 단계가 **실제로 일어난** 시각 — 통화한 / 도착한 / 마친 (단계마다 다른 사건이다) */
    ['occurredAt', 'occurred_at', 'TEXT'],
    /** 직접 · 자동(GPS) · 건너뜀 — **GPS 는 도착 단계에만** 온다 */
    ['source',     'source',      'TEXT'],
    /** ⚠️ 단계마다 뜻이 다르다 (파일 상단 주석) */
    ['memo',       'memo',        'TEXT'],
];

/** 🔴 **그때 무엇을 예측했나** — 나중에 `occurred_at` 과 견주면 우리 계산이 얼마나 맞는지 나온다 (todo ⑥) */
const PREDICT: ColumnDef[] = [
    ['predictedAt', 'predicted_at', 'TEXT'],
];

/** 겪은 일 (JSON 배열) — **목록이 단계마다 다르다** (`REASON_GROUPS_BY_STEP`) */
const REASONS: ColumnDef[] = [
    ['reasons', 'reasons', 'TEXT'],
];

/** 통화에서 정하는 것 — *"몇 시까지 갈게요"* */
const PROMISE: ColumnDef[] = [
    ['promisedArrivalAt',     'promised_arrival_at',      'TEXT'],
    /** 구간 약속의 **"부터"** — *"12시부터 12시30분 사이"* (칸 두 번 탭) */
    ['promisedArrivalFromAt', 'promised_arrival_from_at', 'TEXT'],
];

/**
 * 짐 **계획** — 콜을 잡는 순간 채우고, 적요·통화로 덮인다.
 * `plannedSource` 가 **어디서 온 값인지**를 남긴다 (`VEHICLE`·`MEMO`·`DECLARED` — 규칙 ⑤-2).
 */
const CARGO_PLANNED: ColumnDef[] = [
    ['plannedUnit',        'planned_unit',        'TEXT'],
    ['plannedQuantity',    'planned_quantity',    'INTEGER'],
    ['plannedHandling',    'planned_handling',    'TEXT'],
    ['plannedProtections', 'planned_protections', 'TEXT'],
    ['plannedAfterworks',  'planned_afterworks',  'TEXT'],
    ['plannedTags',        'planned_tags',        'TEXT'],
    ['plannedSource',      'planned_source',      'TEXT'],
    ['plannedAt',          'planned_at',          'TEXT'],
    /** 그때 계산한 정차 시간(분) — 옵션 값이 바뀌면 실제와 갈리므로 **그때 값**을 남긴다 */
    ['plannedDwellMin',    'planned_dwell_min',   'REAL'],
];

/** 짐 **실측** — 현장에서 실제로 보고 적은 것. **완료 단계에만** 있다 */
const CARGO_ACTUAL: ColumnDef[] = [
    ['actualUnit',        'actual_unit',        'TEXT'],
    ['actualQuantity',    'actual_quantity',    'INTEGER'],
    ['actualHandling',    'actual_handling',    'TEXT'],
    ['actualProtections', 'actual_protections', 'TEXT'],
    ['actualAfterworks',  'actual_afterworks',  'TEXT'],
    ['actualTags',        'actual_tags',        'TEXT'],
];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 여섯 단계
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface StepTable {
    step: CallStepId;
    table: string;
    label: string;
    stop: 'pickup' | 'dropoff';
    columns: ColumnDef[];
}

export const STEP_TABLES: readonly StepTable[] = [
    {
        step: 'CALL_PICKUP', table: 'step_call_pickup', label: '상차지 통화', stop: 'pickup',
        columns: [...BASE, ...PROMISE, ...CARGO_PLANNED,
            /**
             * 상차지 통화에서 **함께 들은 하차지 시각.**
             * 🔴 하차지 기록으로 저장하지 않는다 — 그러면 `deriveCallStep` 이
             *    *"하차지 통화를 했다"* 고 보고 단계를 건너뛴다 (규칙 ⑥).
             */
            ['onwardDeadlineAt', 'onward_deadline_at', 'TEXT'],
        ],
    },
    {
        step: 'CALL_DROPOFF', table: 'step_call_dropoff', label: '하차지 통화', stop: 'dropoff',
        // 하차 통화도 짐 계획을 고친다 — 하차 방법·후작업이 여기서 정해진다
        columns: [...BASE, ...PROMISE, ...CARGO_PLANNED],
    },
    {
        step: 'ARRIVE_PICKUP', table: 'step_arrive_pickup', label: '상차지 도착', stop: 'pickup',
        // 🔴 짐이 없다 — **문을 열기 전이라 실측할 수 없다** (도착 사유 기획 §3)
        columns: [...BASE, ...PREDICT, ...REASONS],
    },
    {
        step: 'LOADED', table: 'step_loaded', label: '상차 완료', stop: 'pickup',
        // 계획과 실측이 **한 행에** — 오차를 조인 없이 잰다
        columns: [...BASE, ...PREDICT, ...REASONS, ...CARGO_PLANNED, ...CARGO_ACTUAL],
    },
    {
        step: 'ARRIVE_DROPOFF', table: 'step_arrive_dropoff', label: '하차지 도착', stop: 'dropoff',
        columns: [...BASE, ...PREDICT, ...REASONS],
    },
    {
        step: 'DELIVERED', table: 'step_delivered', label: '하차 완료', stop: 'dropoff',
        columns: [...BASE, ...PREDICT, ...REASONS, ...CARGO_ACTUAL,
            /**
             * 💵 **착불 현금을 받았는가** — 기사님: *"착불현금은 완료 누르기 전에 내가 받을 거야."*
             *    받은 기록이 없으면 미수금으로 남는다 (정산 페이지 소관).
             */
            ['codReceived', 'cod_received', 'INTEGER'],
        ],
    },
];

/** 단계 id 로 찾는다 */
export function stepTableOf(step: CallStepId): StepTable | undefined {
    return STEP_TABLES.find(t => t.step === step);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 읽기
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 🔴 **지금 무엇을 믿어야 하나** — 실측이 있으면 실측, 없으면 계획.
 *
 * 지금 코드는 이 판단을 **읽는 쪽마다 따로** 한다 (`ACTUAL` 행을 찾고, 없으면 `DECLARED`,
 * 그것도 없으면 차종 기본값…). 그래서 화면과 판정이 다른 값을 볼 수 있다.
 */
export function effectiveCargo(r: Record<string, any>) {
    const hasActual = r.actual_unit != null || r.actual_quantity != null;
    return hasActual
        ? { unit: r.actual_unit, quantity: r.actual_quantity, handling: r.actual_handling, assumed: false }
        : { unit: r.planned_unit, quantity: r.planned_quantity, handling: r.planned_handling,
            /** 통화로 들은 값이 아니면 **미확인** — 화면이 그렇게 표시해야 한다 (규칙 ⑤-2) */
            assumed: r.planned_source !== 'DECLARED' };
}

/**
 * 계획 대비 실측이 몇 배인가. **한 행 안에서** 계산된다 — 조인이 없다.
 * `null` 이면 잴 수 없다 (아직 실측이 없거나 환산 불가).
 */
export function cargoMismatchOf(
    r: Record<string, any>,
    pointsOf: (unit: string | null, qty: number | null) => number,
): number | null {
    if (r.actual_unit == null && r.actual_quantity == null) return null;
    const planned = pointsOf(r.planned_unit, r.planned_quantity);
    const actual  = pointsOf(r.actual_unit,  r.actual_quantity);
    if (planned <= 0 || actual <= 0) return null;
    return actual / planned;
}
