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

        /**
         * 🔴 **실측은 상태와 무관하게 실측이다** (2026-08-21 scenario C 실측).
         *    시드·복구된 콜은 완료 밀스톤 없이 실측 신고만 올 수 있다 — LOADED 행이
         *    PLANNED 인 채 actual_* 만 앉는다. 상태 가드보다 먼저 건진다. 안 그러면
         *    적재 신뢰도가 CONFIRMED 로 못 올라간다 (옛 장부는 올라갔다 — 두 목소리).
         */
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

        if (r.status === 'PLANNED' || !r.status) {
            /**
             * 🔴 아직 안 한 일이지만 **계획 짐값은 이미 저장된 값이다** (KEEP 이 차종
             *    기본값으로 심는다). 이걸 버리면 타임라인이 미확인 15분으로 정차를
             *    지어내 시딩(계획 6분 기산)과 **다른 데드라인**을 말한다 — 2026-08-21
             *    리허설 13 실측: 덱 ~15:46 vs 칩 15:37. 규칙 ③(입력도 한 곳).
             *    약속·확정 표시는 **안 나간다** — 서버의 추정 약속이 DECLARED(통화)로
             *    오독되면 "굳은 약속은 안 깎는다"에 걸려 진짜 통화처럼 굳어 버린다.
             */
            if ((s.step === 'CALL_PICKUP' || s.step === 'CALL_DROPOFF') && r.planned_unit != null) {
                reports.push({
                    stopType: s.step === 'CALL_PICKUP' ? 'pickup' : 'dropoff',
                    kind: 'PLANNED',
                    unit: r.planned_unit ?? undefined,
                    quantity: r.planned_quantity ?? undefined,
                    handling: r.planned_handling ?? undefined,
                    protections: parse(r.planned_protections),
                    afterworks: parse(r.planned_afterworks),
                    tags: parse(r.planned_tags),
                });
            }
            continue;
        }

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

        const m = MILESTONE_OF[s.step];
        if (m && r.occurred_at) {
            milestones.push({ milestone: m, occurredAt: r.occurred_at, source: r.source ?? undefined });
        }
    }
    return { reports, milestones };
}

/**
 * ⏱️ **그 콜의 정거장마다 «예측한 정차»와 «실제로 걸린 정차»** — 없으면 `null` (규칙 ④).
 *
 * 기사님(2026-08-30): *"다 나르고 나니까 15분이 걸렸다고 알 수 있는 거야. **누구도
 * 거짓을 말하지 않았고 결과는 바뀐 거지.** 우린 그걸 잘 저장할 수만 있게 만들면 돼."*
 *
 * 🔴 **읽는 규칙이 여기 하나뿐이어야 한다.** 서버 판정(`plannedDwellOf`)과 관제웹
 *    타임라인(`deriveRouteTimeline`)이 이 값을 각자 다르게 고르면 **한 화면이 두 시각을
 *    말한다** — 이 레포가 네 번 겪은 그 사고다.
 *
 * 둘 다 **완료 행**에 산다: 상차는 `LOADED`, 하차는 `DELIVERED`.
 * 통화 행의 `planned_dwell_min` 은 안 본다 — 완료 행이 태어날 때 그 값을 물려받으므로
 * 여기서 또 보면 두 벌이 된다.
 */
export interface DwellPair { planned: number | null; actual: number | null }

export function dwellLedgerOfSteps(steps: StepViewRow[]): { pickup: DwellPair; dropoff: DwellPair } {
    const at = (step: string): DwellPair => {
        const s = steps.find(v => v.step === step);
        if (!s || s.born === false) return { planned: null, actual: null };  // 회색 예정 — 저장된 게 아니다
        const num = (v: unknown) => { const x = Number(v); return Number.isFinite(x) && x >= 0 ? x : null; };
        return { planned: num(s.row?.planned_dwell_min), actual: num(s.row?.actual_dwell_min) };
    };
    return { pickup: at('LOADED'), dropoff: at('DELIVERED') };
}

/**
 * ⏱️ **예측 대비 얼마나 더/덜 걸렸나(분)** — 기사님의 「−5분」의 재료.
 *
 * 🔴 **한쪽만 있으면 `0` 이다.** 견줄 상대가 없는데 «밀렸다»고 말하지 않는다 (규칙 ④).
 */
export function dwellSlipMinutes(p: DwellPair): number {
    return p.planned != null && p.actual != null ? Math.round(p.actual - p.planned) : 0;
}

/** ⏱️ 실측만 — 타임라인이 정차를 이걸로 갈아 끼운다 (있으면 계산을 이긴다) */
export function dwellActualOfSteps(steps: StepViewRow[]): {
    pickup: number | null; dropoff: number | null;
} {
    const l = dwellLedgerOfSteps(steps);
    return { pickup: l.pickup.actual, dropoff: l.dropoff.actual };
}
