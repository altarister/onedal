/**
 * 🪜 **여섯 단계, 여섯 테이블** (2026-08-20 신설)
 *
 * 기사님 구조: *"콜 KEEP → 테이블 생성 … ① 상차지 통화 [완료/스킵] → 상태값 변경 …"*
 * 기사님(2026-08-20): *"일단 나머지 테이블도 다 만들어 보자. 나중에 중복이라 여겨지면 그때 바꾸자."*
 *
 * 🔴 **행은 KEEP 때 생기고, 상태만 바뀐다.**
 *    지금 구조(`stop_cargo_reports`)는 *"행이 있다 = 했다"* 라 **계획을 담을 자리가 없고**,
 *    한 정거장이 최대 세 행(`SKIPPED`·`DECLARED`·`ACTUAL`)으로 흩어진다.
 *    → 근거: docs/결정_이력.md «콜 하나의 생애는 여섯 단계다»
 *
 * 🔴 **여섯을 각각 따로 적는다** (기사님 지시 2026-08-20).
 *    공통 묶음을 조합하면 *"이 테이블에 무엇이 있는지"* 가 한눈에 안 보이고,
 *    무엇보다 **같은 이름의 컬럼이 단계마다 뜻이 다른 것**을 적을 자리가 없다.
 *    기사님이 짚으신 대로 —
 *    ```
 *    상차지 통화  memo = "전화 받지 않음"     통화 시도의 결과
 *    상차 완료    memo = "친절함"            사람·거래처 평가
 *    하차 완료    memo = "하차지 사람없음"    현장 상황
 *    ```
 *    이름이 같다고 같은 값이 아니다. 그래서 컬럼마다 **그 단계에서의 뜻**을 옆에 적는다.
 *
 * ⚠️ **아직 아무도 안 읽는다.** 여섯을 다 만들어 모양을 보고 합칠지 정한다.
 */

import type { CallStepId } from './callSteps';

export const STEP_STATUSES = ['PLANNED', 'DONE', 'SKIPPED'] as const;
export type StepStatus = typeof STEP_STATUSES[number];

/** `[필드, 컬럼, SQL 타입, 이 단계에서의 뜻]` */
export type ColumnDef = readonly [string, string, string, string];

export interface StepTable {
    step: CallStepId;
    table: string;
    label: string;
    stop: 'pickup' | 'dropoff';
    columns: readonly ColumnDef[];
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ① 상차지 통화 — **약속과 짐을 여기서 정한다**
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const CALL_PICKUP: StepTable = {
    step: 'CALL_PICKUP', table: 'step_call_pickup', label: '상차지 통화', stop: 'pickup',
    columns: [
        ['status',     'status',      `TEXT NOT NULL DEFAULT 'PLANNED'`, '계획 · 통화함 · 건너뜀'],
        ['occurredAt', 'occurred_at', 'TEXT',    '**통화한** 시각'],
        ['source',     'source',      'TEXT',    '직접 · 건너뜀 (GPS 는 없다 — 통화를 기계가 대신할 수 없다)'],
        ['memo',       'memo',        'TEXT',    '**통화 시도의 결과** — "전화 받지 않음" · "지하 2층, 경비실 통과"'],

        ['predictedAt', 'predicted_at', 'TEXT', '🔴 **이 통화를 걸 때 예상한 도착 시각** — 약속의 *근거*다. `상차지 도착` 의 같은 이름과 **다른 값**이다: 저기는 도착 직전까지 갱신된 마지막 예상이고, 여기는 **말을 꺼낸 순간** 얼마로 보였는지다. 둘을 견주면 "그때 여유를 얼마나 뒀나" 가 재현된다'],
        ['promisedArrivalAt',     'promised_arrival_at',      'TEXT', '🔴 **"몇 시까지 갈게요"** — 이 단계의 핵심 산출물'],
        ['promisedArrivalFromAt', 'promised_arrival_from_at', 'TEXT', '구간 약속의 **"부터"** — "12시부터 12시30분 사이"'],

        ['plannedUnit',        'planned_unit',        'TEXT',    '파레트 · 라면박스 …'],
        ['plannedQuantity',    'planned_quantity',    'INTEGER', '몇 개'],
        ['plannedHandling',    'planned_handling',    'TEXT',    '지게차 · 수작업'],
        ['plannedProtections', 'planned_protections', 'TEXT',    '🔒 결박 · 그물망 … (JSON · **상차 전용**)'],
        ['plannedAfterworks',  'planned_afterworks',  'TEXT',    '🧹 상차 통화에서 하차 후작업까지 들었을 때만'],
        ['plannedTags',        'planned_tags',        'TEXT',    '일반화물 · 농산물 … (JSON)'],
        ['plannedSource',      'planned_source',      'TEXT',    '🔴 이 값이 **어디서 왔나** — VEHICLE(차종 기본) · MEMO(적요) · DECLARED(통화)'],
        ['plannedAt',          'planned_at',          'TEXT',    '이 계획이 정해진 시각'],
        ['plannedDwellMin',    'planned_dwell_min',   'REAL',    '그때 계산한 상차 소요(분) — 옵션이 바뀌어도 **그때 값**이 남는다'],

        ['onwardDeadlineAt',   'onward_deadline_at',  'TEXT',    '🔴 **여기서만** — 상차 통화에서 함께 들은 하차지 시각. 하차 기록으로 저장하면 "하차 통화를 했다"고 오인된다 (규칙 ⑥)'],
    ],
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ② 하차지 통화 — **하차 방법과 후작업을 정한다**
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const CALL_DROPOFF: StepTable = {
    step: 'CALL_DROPOFF', table: 'step_call_dropoff', label: '하차지 통화', stop: 'dropoff',
    columns: [
        ['status',     'status',      `TEXT NOT NULL DEFAULT 'PLANNED'`, '계획 · 통화함 · 건너뜀'],
        ['occurredAt', 'occurred_at', 'TEXT',    '**통화한** 시각'],
        ['source',     'source',      'TEXT',    '직접 · 건너뜀'],
        ['memo',       'memo',        'TEXT',    '**통화 시도의 결과** — "5시 이후엔 문 닫음"'],

        ['predictedAt', 'predicted_at', 'TEXT', '🔴 **이 통화를 걸 때 예상한 하차지 도착 시각** — 약속의 근거 (`상차지 통화` 와 같은 뜻)'],
        ['promisedArrivalAt',     'promised_arrival_at',      'TEXT', '🔴 **하차 약속** — 상차 통화에서 들은 값(`onward`)이 여기 미리 채워진다'],
        ['promisedArrivalFromAt', 'promised_arrival_from_at', 'TEXT', '구간 약속의 **"부터"**'],

        // 🔴 **짐의 단위·수량은 여기 없다** (기사님 2026-08-20: *"파레트 수량은 빼야 한다"*).
        //    짐은 상차에서 정해지고 하차는 그것을 **내릴 뿐**이다. 복사해 두면 두 벌이 되어
        //    상차에서 라면박스로 고쳤을 때 하차만 파레트로 남는다 (규칙 ③).
        //    필요하면 `step_loaded` 의 실측을, 없으면 `step_call_pickup` 의 계획을 읽는다.
        ['plannedHandling',    'planned_handling',    'TEXT',    '🔴 **하차 방법** — 이 단계에서 정한다 (지게차로 실었으면 대개 지게차로 내린다)'],
        ['plannedProtections', 'planned_protections', 'TEXT',    '⚠️ 하차에는 안 붙는다 — 묶는 자리는 상차다'],
        ['plannedAfterworks',  'planned_afterworks',  'TEXT',    '🧹 **정리 · 검수** — 이 단계의 핵심. 검수 60분이 여기서 붙는다'],
        ['plannedTags',        'planned_tags',        'TEXT',    '짐 성질 (상차에서 온 값)'],
        ['plannedSource',      'planned_source',      'TEXT',    'VEHICLE · MEMO · DECLARED'],
        ['plannedAt',          'planned_at',          'TEXT',    '이 계획이 정해진 시각'],
        ['plannedDwellMin',    'planned_dwell_min',   'REAL',    '그때 계산한 **하차** 소요(분)'],
    ],
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ③ 상차지 도착 — **짐이 없다.** 문을 열기 전이다
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const ARRIVE_PICKUP: StepTable = {
    step: 'ARRIVE_PICKUP', table: 'step_arrive_pickup', label: '상차지 도착', stop: 'pickup',
    columns: [
        ['status',      'status',       `TEXT NOT NULL DEFAULT 'PLANNED'`, '계획 · 도착함 · 건너뜀'],
        ['occurredAt',  'occurred_at',  'TEXT', '**도착한** 시각'],
        ['source',      'source',       'TEXT', '🔴 **GPS 가 오는 유일한 자리** — 직접 · 자동(GPS) · 건너뜀'],
        ['memo',        'memo',         'TEXT', '**오는 길에 겪은 일** — "고속도로 사고로 20분 지연"'],
        ['predictedAt', 'predicted_at', 'TEXT', '🔴 그때 **예측한 도착 시각** — 실제와 견주면 우리 계산이 얼마나 맞는지 나온다 (todo ⑥)'],
        ['reasons',     'reasons',      'TEXT', '**도로 문제 · 상차지 문제 · 기타** (JSON · 짐 이야기는 없다 — 아직 문을 안 열었다)'],
    ],
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ④ 상차 완료 — **계획과 실측이 처음으로 만난다**
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const LOADED: StepTable = {
    step: 'LOADED', table: 'step_loaded', label: '상차 완료', stop: 'pickup',
    columns: [
        ['status',      'status',       `TEXT NOT NULL DEFAULT 'PLANNED'`, '계획 · 상차함 · 건너뜀'],
        ['occurredAt',  'occurred_at',  'TEXT', '**상차를 마친** 시각 (= 출발 시각)'],
        ['source',      'source',       'TEXT', '직접 · 건너뜀'],
        ['memo',        'memo',         'TEXT', '🔴 **사람·거래처 평가** — "친절함". 이건 콜이 아니라 **장소에 쌓여야** 하는 값이다 (`places` · todo ⑤)'],
        ['predictedAt', 'predicted_at', 'TEXT', '그때 예측한 **상차 완료 시각**'],
        ['reasons',     'reasons',      'TEXT', '**화주 미준비 · 물건 없음 · 상차 중 파손 · 기타** (JSON)'],

        ['plannedUnit',        'planned_unit',        'TEXT',    '통화·차종에서 온 **계획**'],
        ['plannedQuantity',    'planned_quantity',    'INTEGER', '〃'],
        ['plannedHandling',    'planned_handling',    'TEXT',    '〃'],
        ['plannedProtections', 'planned_protections', 'TEXT',    '🔒 계획한 보호'],
        ['plannedAfterworks',  'planned_afterworks',  'TEXT',    '⚠️ 상차에는 안 붙는다 (하차용)'],
        ['plannedTags',        'planned_tags',        'TEXT',    '계획한 성질'],
        ['plannedSource',      'planned_source',      'TEXT',    'VEHICLE · MEMO · DECLARED'],
        ['plannedAt',          'planned_at',          'TEXT',    '계획이 정해진 시각'],
        ['plannedDwellMin',    'planned_dwell_min',   'REAL',    '예측한 상차 소요(분)'],

        ['actualUnit',        'actual_unit',        'TEXT',    '🔴 **실제로 실은 것** — 계획과 다르면 여기서 갈린다'],
        ['actualQuantity',    'actual_quantity',    'INTEGER', '🔴 실제 개수 — `planned` 와 견주면 오차가 **한 행 안에서** 나온다'],
        ['actualHandling',    'actual_handling',    'TEXT',    '실제로 쓴 방법'],
        ['actualProtections', 'actual_protections', 'TEXT',    '🔒 실제로 한 보호'],
        ['actualAfterworks',  'actual_afterworks',  'TEXT',    '⚠️ 상차에는 안 붙는다'],
        ['actualTags',        'actual_tags',        'TEXT',    '실제 성질 (열어 보니 달랐을 때)'],
    ],
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ⑤ 하차지 도착 — 상차지 도착과 **컬럼은 같고 사유가 다르다**
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const ARRIVE_DROPOFF: StepTable = {
    step: 'ARRIVE_DROPOFF', table: 'step_arrive_dropoff', label: '하차지 도착', stop: 'dropoff',
    columns: [
        ['status',      'status',       `TEXT NOT NULL DEFAULT 'PLANNED'`, '계획 · 도착함 · 건너뜀'],
        ['occurredAt',  'occurred_at',  'TEXT', '**도착한** 시각'],
        ['source',      'source',       'TEXT', '🔴 **GPS 가 오는 자리** — 직접 · 자동(GPS) · 건너뜀'],
        ['memo',        'memo',         'TEXT', '**현장 상황** — "하차지 사람없음"'],
        ['predictedAt', 'predicted_at', 'TEXT', '그때 예측한 도착 시각'],
        ['reasons',     'reasons',      'TEXT', '🔴 **도로 · 하차지 · 짐 상태 · 기타** — 상차지 도착에 없던 **짐 상태**(짐 무너짐 · 결박 풀림 · 파손 발견)가 여기 있다. 문을 열면 보이기 때문이다'],
    ],
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ⑥ 하차 완료 — **콜의 끝.** 계획은 없고 실측과 돈만 있다
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const DELIVERED: StepTable = {
    step: 'DELIVERED', table: 'step_delivered', label: '하차 완료', stop: 'dropoff',
    columns: [
        ['status',      'status',       `TEXT NOT NULL DEFAULT 'PLANNED'`, '계획 · 하차함 · 건너뜀'],
        ['occurredAt',  'occurred_at',  'TEXT', '🔴 **하차를 마친** 시각 — 관제앱에서 이 콜은 여기서 끝난다 (정산은 별개)'],
        ['source',      'source',       'TEXT', '직접 · 건너뜀'],
        ['memo',        'memo',         'TEXT', '**현장 상황** — "수령인이 검수를 오래 함"'],
        ['predictedAt', 'predicted_at', 'TEXT', '그때 예측한 하차 완료 시각'],
        ['reasons',     'reasons',      'TEXT', '**검수 지연 · 인수 거부 · 기타** (JSON)'],

        ['actualUnit',        'actual_unit',        'TEXT',    '⚠️ 하차에서는 대개 안 고친다 — 상차 실측이 그대로 온다'],
        ['actualQuantity',    'actual_quantity',    'INTEGER', '〃 (일부만 내렸을 때만 다르다)'],
        ['actualHandling',    'actual_handling',    'TEXT',    '🔴 **실제로 쓴 하차 방법**'],
        ['actualProtections', 'actual_protections', 'TEXT',    '⚠️ 하차에는 안 붙는다'],
        ['actualAfterworks',  'actual_afterworks',  'TEXT',    '🧹 **실제로 한 후작업** — 검수를 했나 안 했나'],
        ['actualTags',        'actual_tags',        'TEXT',    '실제 성질'],

        ['codReceived',       'cod_received',       'INTEGER', '💵 🔴 **착불 현금을 받았는가** — 기사님: *"완료 누르기 전에 내가 받을 거야."* 없으면 미수금으로 남는다'],
    ],
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** `db.ts` 가 이 목록을 순회하며 테이블을 만든다 — **DDL 을 손으로 적지 않는다** */
export const STEP_TABLES: readonly StepTable[] = [
    CALL_PICKUP, CALL_DROPOFF, ARRIVE_PICKUP, LOADED, ARRIVE_DROPOFF, DELIVERED,
];

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
