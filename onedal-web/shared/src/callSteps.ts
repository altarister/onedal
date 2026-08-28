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
 *   건너뛰기 2종 (`pickup/SKIPPED` · `dropoff/SKIPPED`)
 *
 * 🔴 **건너뛰기도 서버에 남는다** (2026-08-12). 통화를 했든(`DECLARED`) 건너뛰기로
 *    했든(`SKIPPED`) **그 단계는 지나간 것**이고, 새로고침해도 되살아나지 않는다.
 *    *"내가 확인한 건지 아닌지가 명확하게 데이터로 남아 있어야 가치를 판단할 수 있다"*
 *    (기사님 2026-08-19) — 출처 삼분(직접·자동·건너뜀)이 여기서 나왔다.
 *
 * ⚠️ 예전에는 정반대였다 — *"건너뛰었다는 증거는 서버에 남길 값이 아니다"* 며 화면
 *    로컬(`skippedTo`)에 두고 `max(증거, 건너뛴 지점)` 으로 합쳤고, 새로고침하면
 *    통화 단계가 되살아났다. **그 서술이 08-12 개정 뒤로도 머리말에 남아 있었다**
 *    (2026-08-29 정정). 세 앱 중 하나가 그걸 믿고 `SKIPPED` 를 안 보내면 장부가 깨진다
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

interface MilestoneRow { milestone: string; source?: string }

/**
 * 증거만으로 "여기까지는 확실히 지나왔다"를 구한다.
 *
 * 뒤쪽 증거가 앞쪽을 함축한다 — `PICKED_UP` 이 있으면 통화를 안 했더라도
 * 상차는 이미 끝난 것이므로 통화 단계로 되돌아갈 이유가 없다.
 */
function evidenceIndex(milestones: MilestoneRow[], reports: CargoReport[]): number {
    const has = (m: string) => milestones.some(x => x.milestone === m);
    // 통화를 했든(DECLARED) 건너뛰기로 했든(SKIPPED) **그 단계는 지나간 것**이다.
    // 건너뛰기도 서버에 남으므로 새로고침해도 되살아나지 않는다 (2026-08-12).
    const called = (stop: 'pickup' | 'dropoff') =>
        reports.some(r => r.stopType === stop && (r.kind === 'DECLARED' || r.kind === 'SKIPPED'));

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
    /**
     * 🔴 **`done`(초록칠)은 증거가 있는 단계만이다** — "지나갔다"와 "확인했다"는 다르다.
     *    건너뛴 칸(`source: 'SKIPPED'`)은 진행은 하되 초록이 아니다. 화면에서 구분되지
     *    않으면 *"내가 확인한 건지 아닌지"* 를 알 수 없다 (기사님 2026-08-19).
     *    통화도 같은 규칙이다 — `SKIPPED` 리포트는 진행만 시키고 초록은 안 된다.
     */
    const confirmed = (m: string) =>
        milestones.some(x => x.milestone === m && x.source !== 'SKIPPED');
    const called = (stop: 'pickup' | 'dropoff') =>
        reports.some(r => r.stopType === stop && r.kind === 'DECLARED');

    const done = [
        called('pickup'),
        called('dropoff'),
        confirmed('ARRIVED_PICKUP'),
        confirmed('PICKED_UP'),
        confirmed('ARRIVED_DROPOFF'),
        confirmed('DELIVERED'),
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

export const STEP_MILESTONE: Partial<Record<CallStepId, string>> = {
    ARRIVE_PICKUP: 'ARRIVED_PICKUP',
    LOADED: 'PICKED_UP',
    ARRIVE_DROPOFF: 'ARRIVED_DROPOFF',
    DELIVERED: 'DELIVERED',
};
