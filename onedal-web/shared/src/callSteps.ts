import type { CargoReport } from './index';

/**
 * [Phase 8.5] 콜 하나의 진행 6단계.
 *
 * 기사님: *"상차지 통화 - 하차지 통화 - 상차지 현장 도착 - 상차지 현장 상차완료
 * - 하차지 현장 도착 - 하차지 현장 하차완료 이렇게 진행될 예정이고
 * 모두 완료하면 콜이 완료되어야 한다.
 * **적요가 충분히 디테일하다면 전화는 패스**하고 바로 이동할 수 있을 수 있다."*
 *
 * ══ 왜 저장하지 않고 파생시키는가 ══
 *
 * 현재 단계를 `useState` 에 담으면 새로고침·재접속·스와이프에서 어긋난다.
 * 2026-08-10 하루에만 같은 종류의 버그가 여섯 번 났다
 * (BB 재탐색 · DD 운임 · II 적재 · JJ 종결 · PP 배차단계 · WW 상태 동기화).
 * 전부 "저장해 둔 값이 실제와 갈라진" 경우였다.
 *
 * 그래서 단계는 **이미 서버에 있는 증거**로만 판정한다.
 *   마일스톤 4종 (`ARRIVED_PICKUP` · `PICKED_UP` · `ARRIVED_DROPOFF` · `DELIVERED`)
 *   통화 기록 2종 (`pickup/DECLARED` · `dropoff/DECLARED`)
 *
 * ⚠️ 단 하나, **"통화를 건너뛰었다"는 증거가 없다.** 서버에 남길 값이 아니기 때문이다
 *    (안 한 일을 기록으로 만들면 데이터가 오염된다).
 *    그래서 건너뛰기만 화면 로컬로 두고 `max(증거, 건너뛴 지점)` 으로 합친다.
 *    새로고침하면 통화 단계가 다시 보이는데, 그건 **안전한 쪽의 실패**다 —
 *    전화를 한 번 더 걸 수 있을 뿐, 기록이 틀어지지는 않는다.
 */

export const CALL_STEPS = [
    { id: 'CALL_PICKUP',    label: '상차지 통화', stop: 'pickup',  optional: true  },
    { id: 'CALL_DROPOFF',   label: '하차지 통화', stop: 'dropoff', optional: true  },
    { id: 'ARRIVE_PICKUP',  label: '상차지 도착', stop: 'pickup',  optional: false },
    { id: 'LOADED',         label: '상차 완료',   stop: 'pickup',  optional: false },
    { id: 'ARRIVE_DROPOFF', label: '하차지 도착', stop: 'dropoff', optional: false },
    { id: 'DELIVERED',      label: '하차 완료',   stop: 'dropoff', optional: false },
] as const;

export type CallStepId = typeof CALL_STEPS[number]['id'];
export const CALL_STEP_COUNT = CALL_STEPS.length;

export interface CallProgress {
    /** 지금 해야 할 단계의 인덱스. `CALL_STEP_COUNT` 면 모두 끝났다 */
    index: number;
    /** 단계별로 **증거가 있는가**. 건너뛴 단계는 false 로 남아 화면에서 구분된다 */
    done: boolean[];
    allDone: boolean;
    /** 지금 단계 (모두 끝났으면 null) */
    current: typeof CALL_STEPS[number] | null;
}

interface MilestoneRow { milestone: string }

/**
 * 증거만으로 "여기까지는 확실히 지나왔다"를 구한다.
 *
 * 뒤쪽 증거가 앞쪽을 함축한다 — `PICKED_UP` 이 있으면 통화를 안 했더라도
 * 상차는 이미 끝난 것이므로 통화 단계로 되돌아갈 이유가 없다.
 */
function evidenceIndex(milestones: MilestoneRow[], reports: CargoReport[]): number {
    const has = (m: string) => milestones.some(x => x.milestone === m);
    const called = (stop: 'pickup' | 'dropoff') =>
        reports.some(r => r.stopType === stop && r.kind === 'DECLARED');

    if (has('DELIVERED')) return 6;
    if (has('ARRIVED_DROPOFF')) return 5;
    if (has('PICKED_UP')) return 4;
    if (has('ARRIVED_PICKUP')) return 3;
    if (called('dropoff')) return 2;
    if (called('pickup')) return 1;
    return 0;
}

/**
 * @param skippedTo 화면에서 건너뛰기로 전진한 지점 (세션 로컬). 증거보다 앞설 때만 쓰인다.
 */
export function deriveCallStep(
    milestones: MilestoneRow[] = [],
    reports: CargoReport[] = [],
    skippedTo = 0,
): CallProgress {
    const has = (m: string) => milestones.some(x => x.milestone === m);
    const called = (stop: 'pickup' | 'dropoff') =>
        reports.some(r => r.stopType === stop && r.kind === 'DECLARED');

    const done = [
        called('pickup'),
        called('dropoff'),
        has('ARRIVED_PICKUP'),
        has('PICKED_UP'),
        has('ARRIVED_DROPOFF'),
        has('DELIVERED'),
    ];

    // 건너뛰기는 앞으로만 민다. 증거가 더 앞서 있으면 증거가 이긴다 —
    // 화면 상태가 서버 기록을 되돌리는 일은 없어야 한다.
    const index = Math.min(
        CALL_STEP_COUNT,
        Math.max(evidenceIndex(milestones, reports), skippedTo),
    );

    return {
        index,
        done,
        allDone: index >= CALL_STEP_COUNT,
        current: index >= CALL_STEP_COUNT ? null : CALL_STEPS[index],
    };
}

/** 되돌아갈 수 있는 단계인가 — **끝난 단계만**. 앞으로 건너뛰면 기록이 뒤엉킨다 */
export function canRewindTo(progress: CallProgress, target: number): boolean {
    return target >= 0 && target < progress.index;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 이 정거장까지 **지금부터** 얼마나 걸리는가
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 🔴 2026-08-11 발견한 버그를 막는 함수다.
 *
 * 하차지 통화 화면이 `상차지 → 하차지` 주행 시간만 쓰고 있었다.
 * 아직 상차지에 가지도 않았는데 **현위치 → 상차지 이동과 상차 작업이 통째로 빠져서**,
 * 도착 예상이 실제보다 이르게 나오고 `지각` 판정도 낙관적이었다.
 * 그 화면을 보고 약속하면 **기사님이 못 지킬 시각을 약속하게 된다.**
 *
 * 기사님이 정하신 하차지 통화 문구가 애초에 이 구조였다 —
 * *"**상차를 몇 시까지 완료하면** 이동하는데 얼마가 걸리고 하차지까지 얼마나 걸릴 예정이다."*
 *
 * 그래서 남은 시간을 **어디까지 왔는지(마일스톤)로 파생**시킨다. 화면이 직접 고르지 않는다.
 */
export interface StopLead {
    /** 이 정거장까지 남은 **주행** 시간(분). 한 구간이라도 모르면 `null` — 0 으로 때우지 않는다 */
    driveMinutes: number | null;
    /** 주행 말고 앞에서 이미 써야 하는 시간(분). 예: 상차 작업 */
    leadMinutes: number;
    /** 그 시간이 무엇인지. 없으면 `null` */
    leadLabel: string | null;
}

export function remainingToStop(p: {
    stop: 'pickup' | 'dropoff';
    /** 현위치 → 상차지 */
    approachMinutes?: number | null;
    /** 상차지 → 하차지 */
    soloMinutes?: number | null;
    /** 상차 작업에 걸리는 시간 */
    pickupDwellMinutes: number;
    arrivedPickup: boolean;
    pickedUp: boolean;
    arrivedDropoff: boolean;
}): StopLead {
    const none = { leadMinutes: 0, leadLabel: null };
    const at = (v?: number | null) => (v != null && v > 0 ? v : null);

    if (p.stop === 'pickup') {
        // 이미 상차지에 서 있으면 더 갈 곳이 없다
        return p.arrivedPickup
            ? { driveMinutes: 0, ...none }
            : { driveMinutes: at(p.approachMinutes), ...none };
    }

    if (p.arrivedDropoff) return { driveMinutes: 0, ...none };
    // 상차를 마쳤으면 남은 건 하차지까지 주행뿐이다
    if (p.pickedUp) return { driveMinutes: at(p.soloMinutes), ...none };

    const solo = at(p.soloMinutes);
    // 상차지에 도착은 했지만 아직 싣지 않았다 — 상차 시간이 남아 있다
    if (p.arrivedPickup) {
        return { driveMinutes: solo, leadMinutes: p.pickupDwellMinutes, leadLabel: '상차' };
    }
    // 아직 상차지에도 못 갔다 — 접근 주행 + 상차 + 하차지까지 주행이 전부 남았다
    const approach = at(p.approachMinutes);
    return {
        driveMinutes: approach != null && solo != null ? approach + solo : null,
        leadMinutes: p.pickupDwellMinutes,
        leadLabel: '상차',
    };
}

/** 이 단계를 마쳤다고 서버에 보고할 마일스톤 (통화 단계는 마일스톤이 없다) */
export const STEP_MILESTONE: Partial<Record<CallStepId, string>> = {
    ARRIVE_PICKUP: 'ARRIVED_PICKUP',
    LOADED: 'PICKED_UP',
    ARRIVE_DROPOFF: 'ARRIVED_DROPOFF',
    DELIVERED: 'DELIVERED',
};
