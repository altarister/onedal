import type { OrderStatus } from './callStatus';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// [Phase 8.2] 운행 마일스톤 — 확정과 종료 사이의 실제 업무 단계
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 운행 마일스톤 4단계.
 *
 * 기사님: *"실제로 도착 버튼과 상차 완료 버튼을 누른 시간을 넣어 주어 저장해 주면
 * **예상 시간과 오차를 확인**할 수 있을 듯하다."*
 *
 * 🎯 그래서 도착을 따로 받는다. 도착과 완료 사이가 곧 **실제 상하차 소요 시간**이라,
 *    `dwellMinutes()` 의 추정치(지게차 19분 / 수작업 60분)를 **실측으로 검증**할 수 있다.
 *    지금 그 값은 내가 정한 계수일 뿐이다. 기사님 현장에서 맞는지는 재봐야 안다.
 */
export const MILESTONES = ['ARRIVED_PICKUP', 'PICKED_UP', 'ARRIVED_DROPOFF', 'DELIVERED'] as const;
export type Milestone = typeof MILESTONES[number];

/**
 * 마일스톤이 들어온 경로. **셋 다 같은 함수로 수렴시킨다.**
 *   AUTO_SCRAPE — 앱이 배차망 화면 변화를 감지 (인성앱 상세의 `상태 : 배송` 텍스트)
 *   APP_BUTTON  — 앱에서 기사님이 직접
 *   MANUAL_WEB  — 관제탑에서 기사님이 직접
 * 나중에 자동 감지 정확도를 측정할 유일한 근거이므로 반드시 기록한다.
 */
/**
 * 🔴 **출처가 곧 신뢰도다** (기사님 확정).
 *
 * 기사님: *"내가 확인한 건지 아닌지가 명확하게 데이터로 남아 있어야
 * 데이터로 가치가 있는지 판단할 수 있을 것 같아."*
 *
 *   `MANUAL_WEB`·`APP_BUTTON` — 기사님이 **직접** 눌렀다 → 확인된 시각, 실측 통계에 쓴다
 *   `GPS`                     — 자동 감지 → 참고값 (500m 안에 들어왔다)
 *   `SKIPPED`                 — **안 한 채 지나갔다** → 그 콜의 실측은 믿을 수 없다
 */
export const MILESTONE_SOURCES = ['AUTO_SCRAPE', 'APP_BUTTON', 'MANUAL_WEB', 'GPS', 'SKIPPED'] as const;
export type MilestoneSource = typeof MILESTONE_SOURCES[number];

/**
 * 건너뛴 기록인가 — **판단은 여기 한 곳**이다.
 * 문자열 비교를 여기저기 흩으면 또 갈라진다 (`hasVisitedStop` 을 만든 이유와 같다).
 */
export function isSkipped(m: { source?: string | null }): boolean {
    return m.source === 'SKIPPED';
}

/** 마일스톤 → 그 보고가 성립했을 때의 오더 상태 */
/**
 * 마일스톤 → 오더 상태.
 * 도착(ARRIVED_*)은 **상태를 바꾸지 않는다** — 도착했다고 짐이 실린 것은 아니다.
 * 시각만 기록해 두고 오차 계산에 쓴다.
 */
export const MILESTONE_TO_STATUS: Record<Milestone, OrderStatus | null> = {
    ARRIVED_PICKUP: null,
    PICKED_UP: 'ORDER_PICKED_UP',
    ARRIVED_DROPOFF: null,
    DELIVERED: 'ORDER_DELIVERED',
};

/**
 * 남아 있는 마일스톤으로 **오더 상태를 파생**한다.
 *
 * 기사님 기준: *"단계별로 DB 에 저장하고 … **수정이 가능해야 한다**."*
 * 잘못 누른 마일스톤을 지울 때 상태를 손으로 되돌리면(예: DELIVERED 취소 → CONFIRMED)
 * 어느 상태로 갈지를 취소 경로마다 다시 정해야 하고, 그러다 갈라진다.
 * 지우고 나서 **남은 것으로 다시 구하면** 갈라질 자리가 없다.
 */
export function deriveStatusFromMilestones(milestones: { milestone: string }[]): OrderStatus {
    const has = (m: string) => milestones.some(x => x.milestone === m);
    if (has('DELIVERED')) return 'ORDER_DELIVERED';
    if (has('PICKED_UP')) return 'ORDER_PICKED_UP';
    return 'ORDER_CONFIRMED';
}

export const MILESTONE_LABEL: Record<Milestone, string> = {
    ARRIVED_PICKUP: '상차지 도착',
    PICKED_UP: '상차 완료',
    ARRIVED_DROPOFF: '하차지 도착',
    DELIVERED: '하차 완료',
};


/**
 * 이 오더에서 지금 보고할 수 있는 마일스톤.
 *
 * 순서를 강제한다 — 상차 없이 하차가 먼저 올 수는 있어도(기사님이 상차 보고를 건너뜀),
 * **하차한 뒤에 상차 보고가 늦게 도착해도 상태를 되돌리지 않는다.**
 * 자동 감지와 수동 클릭이 뒤섞이면 순서가 역전될 수 있기 때문이다.
 */
export function canReportMilestone(status: string | undefined, milestone: Milestone): boolean {
    switch (milestone) {
        // 도착은 상태를 바꾸지 않으므로 아직 안 끝난 콜이면 언제든 받는다
        case 'ARRIVED_PICKUP':  return status === 'ORDER_CONFIRMED';
        case 'PICKED_UP':       return status === 'ORDER_CONFIRMED';
        case 'ARRIVED_DROPOFF': return status === 'ORDER_CONFIRMED' || status === 'ORDER_PICKED_UP';
        case 'DELIVERED':       return status === 'ORDER_CONFIRMED' || status === 'ORDER_PICKED_UP';
        default: return false;
    }
}

/**
 * 예상과 실제의 오차(분). 양수면 늦은 것.
 * 이 값이 쌓이면 `dwellMinutes()` 계수와 카카오 ETA 를 현장에 맞게 교정할 수 있다.
 */
export function timingError(predictedAt?: string | null, occurredAt?: string | null): number | null {
    if (!predictedAt || !occurredAt) return null;
    const p = new Date(predictedAt).getTime();
    const o = new Date(occurredAt).getTime();
    if (!Number.isFinite(p) || !Number.isFinite(o)) return null;
    return Math.round((o - p) / 60000);
}
