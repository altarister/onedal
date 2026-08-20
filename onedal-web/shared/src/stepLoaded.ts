/**
 * 📦 **상차 완료 (`LOADED`) — 한 단계, 한 행** (2026-08-20 신설)
 *
 * 기사님 구조: *"콜 KEEP → 테이블 생성 … ④ 상차 완료 → 상태값 변경"*
 * 여섯 단계 중 **하나를 먼저 만들어 모양을 본다.**
 *
 * 🔴 **지금 구조와 무엇이 다른가**
 *
 * | | 지금 (`stop_cargo_reports`) | 여기 |
 * |---|---|---|
 * | 계획(파레트 2개) | **안 남는다** | `planned_*` |
 * | 스킵 사실 | 빈 행 하나 | `status='SKIPPED'` |
 * | 실측(라면박스) | 다른 행 | `actual_*` |
 * | 오차 | 두 행을 찾아 비교 | **한 행 안에서** |
 *
 * 전수 조사 §3 의 시나리오 —
 * *"1t 콜 → 파레트 2개가 눌린 채 통화 스킵 → 상차 완료에서 라면박스로 변경"* —
 * 에서 **네 값이 다 남는다.** 그게 이 설계의 합격 기준이다 (§5).
 *
 * ⚠️ **아직 아무도 안 쓴다.** 테이블만 만들고, 연결은 모양을 확인한 뒤에.
 */

import type { CargoSource } from './cargoSpec';
import type { MilestoneSource } from './index';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 상태 — 이 단계가 어디까지 왔나
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 🔴 **행은 KEEP 때 생기고, 상태만 바뀐다** (기사님 구조).
 *
 *   `PLANNED`  콜을 잡았다 — 계획값이 들어 있다. 아직 안 했다
 *   `DONE`     상차를 마쳤다 — 실측이 들어 있다
 *   `SKIPPED`  건너뛰었다 — **계획값은 그대로 남는다**
 *
 * ⚠️ 지금 구조는 *"행이 없다 = 안 했다"* 인데, 그러면 **"아직"과 "영영"을 구분 못 한다.**
 *    상태값이 있으면 그 구분이 데이터에 남는다.
 */
export const STEP_STATUSES = ['PLANNED', 'DONE', 'SKIPPED'] as const;
export type StepStatus = typeof STEP_STATUSES[number];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 행 하나의 모양
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface StepLoadedRow {
    orderId: string;
    userId: string;
    status: StepStatus;

    // ── 계획 — 콜을 잡는 순간 채운다 (차종 기본 → 적요 → 통화 순으로 덮인다)
    plannedUnit: string | null;
    plannedQuantity: number | null;
    plannedHandling: string | null;
    /** JSON 배열 — 결박·그물망·호루·탑박스 */
    plannedProtections: string[];
    plannedTags: string[];
    /** 이 계획값이 **어디서 왔나** (규칙 ⑤-2 — 같은 값이라도 출처가 다르면 믿음이 다르다) */
    plannedSource: CargoSource;
    /** 언제 계획이 정해졌나 */
    plannedAt: string;
    /** 🔴 그때 **예측한 상차 소요(분)** — 나중에 실제와 견주면 우리 계산이 얼마나 맞는지 나온다 */
    plannedDwellMin: number | null;
    /** 🔴 그때 예측한 **완료 시각** — `predictedAt` 과 같은 발상 (todo ⑥) */
    predictedAt: string | null;

    // ── 실측 — 상차를 마치고 채운다. 안 했으면 전부 null
    actualUnit: string | null;
    actualQuantity: number | null;
    actualHandling: string | null;
    actualProtections: string[];
    actualTags: string[];

    // ── 증거
    /** 실제로 상차를 마친 시각 */
    occurredAt: string | null;
    /** 직접 · 자동(GPS) · 건너뜀 — 무엇을 믿을 수 있는지 가른다 */
    source: MilestoneSource | null;
    /** 겪은 일 (화주 미준비 · 물건 없음 · 기타) */
    reasons: string[];
    memo: string | null;

    recordedAt: string;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// DB 컬럼 — `db.ts` 가 이 목록으로 테이블을 만든다
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 필드 ↔ 컬럼 ↔ 타입. **여기만 고치면 DDL 이 따라온다** (`CALL_OPTION_COLUMNS` 와 같은 방식) */
export const STEP_LOADED_COLUMNS: ReadonlyArray<[keyof StepLoadedRow, string, string]> = [
    ['status',             'status',              `TEXT NOT NULL DEFAULT 'PLANNED'`],

    ['plannedUnit',        'planned_unit',        'TEXT'],
    ['plannedQuantity',    'planned_quantity',    'INTEGER'],
    ['plannedHandling',    'planned_handling',    'TEXT'],
    ['plannedProtections', 'planned_protections', 'TEXT'],
    ['plannedTags',        'planned_tags',        'TEXT'],
    ['plannedSource',      'planned_source',      'TEXT'],
    ['plannedAt',          'planned_at',          'TEXT'],
    ['plannedDwellMin',    'planned_dwell_min',   'REAL'],
    ['predictedAt',        'predicted_at',        'TEXT'],

    ['actualUnit',         'actual_unit',         'TEXT'],
    ['actualQuantity',     'actual_quantity',     'INTEGER'],
    ['actualHandling',     'actual_handling',     'TEXT'],
    ['actualProtections',  'actual_protections',  'TEXT'],
    ['actualTags',         'actual_tags',         'TEXT'],

    ['occurredAt',         'occurred_at',         'TEXT'],
    ['source',             'source',              'TEXT'],
    ['reasons',            'reasons',             'TEXT'],
    ['memo',               'memo',                'TEXT'],
];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 읽기 — 계획과 실측을 견준다
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 🔴 **지금 무엇을 믿어야 하나** — 실측이 있으면 실측, 없으면 계획.
 *
 * 지금 코드는 이 판단을 **읽는 쪽마다 따로** 한다 (`ACTUAL` 행을 찾고, 없으면 `DECLARED`,
 * 그것도 없으면 차종 기본값…). 그래서 화면과 판정이 다른 값을 볼 수 있다.
 */
export function effectiveCargo(r: StepLoadedRow) {
    const hasActual = r.actualUnit != null || r.actualQuantity != null;
    return hasActual
        ? { unit: r.actualUnit, quantity: r.actualQuantity, handling: r.actualHandling,
            protections: r.actualProtections, tags: r.actualTags, assumed: false }
        : { unit: r.plannedUnit, quantity: r.plannedQuantity, handling: r.plannedHandling,
            protections: r.plannedProtections, tags: r.plannedTags,
            /** 통화로 들은 값이 아니면 **미확인** — 화면이 그렇게 표시해야 한다 */
            assumed: r.plannedSource !== 'DECLARED' };
}

/**
 * 계획 대비 실측이 몇 배인가. **한 행 안에서 계산된다** — 조인이 없다.
 * `null` 이면 잴 수 없다 (아직 실측이 없거나 환산 불가).
 */
export function loadedMismatch(r: StepLoadedRow, pointsOf: (unit: string | null, qty: number | null) => number) {
    if (r.actualUnit == null && r.actualQuantity == null) return null;
    const planned = pointsOf(r.plannedUnit, r.plannedQuantity);
    const actual  = pointsOf(r.actualUnit,  r.actualQuantity);
    if (planned <= 0 || actual <= 0) return null;
    return actual / planned;
}
