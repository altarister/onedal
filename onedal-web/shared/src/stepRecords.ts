/**
 * 🔄 **단계 행 → 옛 장부 모양 어댑터** (파생 치환 ① · 2026-08-21)
 *
 * `deriveRouteTimeline`·`deriveCallStep`·`deriveCallTiming` 은 옛 장부 모양
 * (통화신고 `CargoReport` · 마일스톤)을 먹는다. 그 계산들은 검사로 두껍게 덮여
 * 있으므로 **건드리지 않는다** — 대신 새 장부(여섯 단계 행)를 옛 모양으로 바꿔
 * 주는 이 어댑터 하나를 세우고, 읽는 곳의 **재료 출처만** 바꾼다.
 *
 * 🔴 약속 규칙이 그대로 건너간다:
 *   · 통화 완료(DONE) 약속      → `DECLARED` — **확정.** 출발 마감을 묶는다
 *   · 통화 건너뜀(SKIPPED) 약속 → `SKIPPED` — 확정 아님. 타임라인은 추정으로 흐른다
 *     (기사님 2026-08-19: *"통화 없이 정해진 값을 확정할 권한이 내겐 없어"*)
 *   · PLANNED · 회색 예정       → 기록 없음 — 아직 안 한 일이다
 *
 * 옛 테이블(`stop_cargo_reports`·`order_milestones`)이 철거되면 이 어댑터가
 * 그 모양의 **유일한 생산자**가 된다.
 */

/** 서버 `stepsView()` 가 주는 한 단계 (관제웹 `steps-synced` 페이로드와 같다) */
export interface StepViewRow {
    step: string;
    born?: boolean;
    row: Record<string, any>;
}

export interface StepRecords {
    reports: any[];      // CargoReport 모양
    milestones: Array<{ milestone: string; occurredAt: string; source?: string }>;
}

const parse = (v?: string | null): string[] | undefined => {
    try { const a = v ? JSON.parse(v) : null; return Array.isArray(a) && a.length ? a : undefined; }
    catch { return undefined; }
};

const MILESTONE_OF: Record<string, string> = {
    ARRIVE_PICKUP: 'ARRIVED_PICKUP', LOADED: 'PICKED_UP',
    ARRIVE_DROPOFF: 'ARRIVED_DROPOFF', DELIVERED: 'DELIVERED',
};

export function recordsOfSteps(steps: StepViewRow[]): StepRecords {
    const reports: any[] = [];
    const milestones: StepRecords['milestones'] = [];

    for (const s of steps) {
        if (s.born === false) continue;                  // 회색 예정 — 저장된 게 아니다
        const r = s.row ?? {};
        if (r.status === 'PLANNED' || !r.status) continue;   // 아직 안 한 일

        if (s.step === 'CALL_PICKUP' || s.step === 'CALL_DROPOFF') {
            reports.push({
                stopType: s.step === 'CALL_PICKUP' ? 'pickup' : 'dropoff',
                kind: r.status === 'SKIPPED' ? 'SKIPPED' : 'DECLARED',
                unit: r.planned_unit ?? undefined,
                quantity: r.planned_quantity ?? undefined,
                handling: r.planned_handling ?? undefined,
                protections: parse(r.planned_protections),
                afterworks: parse(r.planned_afterworks),
                tags: parse(r.planned_tags),
                promisedArrivalAt: r.promised_arrival_at ?? undefined,
                promisedArrivalFromAt: r.promised_arrival_from_at ?? undefined,
                onwardDeadlineAt: r.onward_deadline_at ?? undefined,
                memo: r.memo ?? undefined,
            });
        }

        // 실측 — 상차·하차 완료 행의 actual_* (정차 계산에서 계획을 이긴다)
        if ((s.step === 'LOADED' || s.step === 'DELIVERED') && r.actual_unit != null) {
            reports.push({
                stopType: s.step === 'LOADED' ? 'pickup' : 'dropoff',
                kind: 'ACTUAL',
                unit: r.actual_unit ?? undefined,
                quantity: r.actual_quantity ?? undefined,
                handling: r.actual_handling ?? undefined,
                protections: parse(r.actual_protections),
                afterworks: parse(r.actual_afterworks),
                tags: parse(r.actual_tags),
            });
        }

        const m = MILESTONE_OF[s.step];
        if (m && r.occurred_at) {
            milestones.push({ milestone: m, occurredAt: r.occurred_at, source: r.source ?? undefined });
        }
    }
    return { reports, milestones };
}
