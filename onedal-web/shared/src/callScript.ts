/**
 * [Phase 8.4] 통화 대본 — 기사님이 **읽을 문장**을 시스템이 만들어 준다
 *
 * 기사님이 실제로 하는 통화:
 *
 *   상차지 → *"여기서 이동하는데 얼마가 걸리니 얼마나 후 도착 예정이다.
 *             여유시간 얼마 잡고 몇 시까지 갈 수 있을 듯싶다. 내가 수행해도 될까요?"*
 *
 *   하차지 → *"상차를 몇 시까지 완료하면 이동하는데 얼마가 걸리고 하차지까지 얼마나 걸릴 예정이다.
 *             여유시간 얼마 잡고 몇 시까지 갈 수 있을 듯싶다. 내가 수행해도 될까요?"*
 *
 * 🔴 이 말을 듣고 나서야 UI 설계가 틀렸다는 걸 알았다.
 *    그동안 이 화면을 **"정보를 입력받는 폼"** 으로 만들고 있었는데,
 *    기사님에게 정작 필요한 건 **"통화 중에 읽을 문장"** 이다.
 *
 *    문장에 들어가는 값(이동 시간·도착 예정·상하차 소요)은 **시스템이 이미 다 알고 있다.**
 *    기사님이 그걸 머릿속으로 더하고 있을 이유가 없다. 읽어 주기만 하면 된다.
 *    입력은 그 다음 — 담당자가 "네" 하면 확정, 다른 시각을 부르면 그때 조정한다.
 *
 * 그래서 흐름이 이렇게 바뀐다.
 *   (전) 전화 → 머릿속 계산 → 말하기 → 화면에서 항목 4~5개 입력
 *   (후) 대본 읽기 → 담당자 답변 → **탭 한 번**
 */

export interface CallScriptInput {
    stopType: 'pickup' | 'dropoff';
    nowMs: number;
    /** 현위치 → 상차지 이동 시간(분) */
    approachMinutes?: number | null;
    /** 상차지 → 하차지 이동 시간(분) */
    lineHaulMinutes?: number | null;
    /** 상차 소요 시간(분) */
    pickupDwell?: number;
    /** 여유 시간(분). 기사님이 통화에서 직접 부르는 값 */
    bufferMinutes: number;
    /** 상차 완료 예정 시각이 이미 정해졌으면 (하차 대본이 이 값에서 출발한다) */
    pickupDoneAtMs?: number | null;
}

export interface CallScript {
    /** 통화에서 그대로 읽을 문장 */
    text: string;
    /** 여유를 뺀 순수 예상 도착 (ms) */
    etaMs: number;
    /** 담당자에게 약속하는 시각 = 예상 도착 + 여유 (ms) */
    proposedMs: number;
    /** 계산 근거. 화면에 작게 같이 보여준다 — 담당자가 되물으면 답할 수 있어야 한다 */
    steps: Array<{ label: string; minutes: number }>;
    /** 값이 없어 추정으로 때운 부분이 있는가 */
    incomplete: boolean;
}

const HHMM = (ms: number) => {
    const d = new Date(ms);
    return `${d.getHours()}시${d.getMinutes() ? ` ${d.getMinutes()}분` : ''}`;
};

/** 이동 시간을 모를 때 쓰는 값. 대본에는 "확인 중"으로 표시해 거짓말하지 않는다 */
const UNKNOWN = null;

export function buildCallScript(input: CallScriptInput): CallScript {
    const {
        stopType, nowMs, approachMinutes, lineHaulMinutes,
        pickupDwell = 0, bufferMinutes, pickupDoneAtMs,
    } = input;

    const steps: CallScript['steps'] = [];
    let incomplete = false;

    if (stopType === 'pickup') {
        const move = approachMinutes ?? UNKNOWN;
        if (move === null) incomplete = true;

        const etaMs = nowMs + (move ?? 0) * 60_000;
        const proposedMs = etaMs + bufferMinutes * 60_000;

        if (move !== null) steps.push({ label: '여기서 상차지까지', minutes: move });
        steps.push({ label: '여유', minutes: bufferMinutes });

        const movePart = move !== null
            ? `여기서 상차지까지 ${move}분 걸립니다. ${HHMM(etaMs)} 도착 예정이고`
            : `상차지까지 이동 시간을 확인 중입니다`;

        return {
            text: `${movePart}, 여유 ${bufferMinutes}분 잡으면 `
                + `${HHMM(proposedMs)}까지는 갈 수 있을 것 같습니다. 제가 수행해도 될까요?`,
            etaMs, proposedMs, steps, incomplete,
        };
    }

    // ── 하차지 ──
    // 출발점은 "상차 완료 시각"이다. 상차지 통화가 먼저 끝나 있으면 그 약속 시각을 쓰고,
    // 아직이면 지금 + 이동 + 상차 소요로 추정한다.
    let baseMs: number;
    if (pickupDoneAtMs) {
        baseMs = pickupDoneAtMs;
    } else {
        if (approachMinutes == null) incomplete = true;
        baseMs = nowMs + ((approachMinutes ?? 0) + pickupDwell) * 60_000;
        if (approachMinutes != null) steps.push({ label: '여기서 상차지까지', minutes: approachMinutes });
        if (pickupDwell) steps.push({ label: '상차', minutes: pickupDwell });
    }

    const haul = lineHaulMinutes ?? UNKNOWN;
    if (haul === null) incomplete = true;

    const etaMs = baseMs + (haul ?? 0) * 60_000;
    const proposedMs = etaMs + bufferMinutes * 60_000;

    if (haul !== null) steps.push({ label: '상차지에서 하차지까지', minutes: haul });
    steps.push({ label: '여유', minutes: bufferMinutes });

    const haulPart = haul !== null
        ? `하차지까지 ${haul}분 걸려서 ${HHMM(etaMs)} 도착 예정입니다`
        : `하차지까지 이동 시간을 확인 중입니다`;

    return {
        text: `상차를 ${HHMM(baseMs)}까지 완료하면 ${haulPart}. `
            + `여유 ${bufferMinutes}분 잡으면 ${HHMM(proposedMs)}까지는 갈 수 있을 것 같습니다. `
            + `제가 수행해도 될까요?`,
        etaMs, proposedMs, steps, incomplete,
    };
}

/** 여유 시간 후보. 기사님이 통화에서 부르는 값이라 큼직하게 끊는다 */
export const BUFFER_PRESETS = [10, 20, 30, 60] as const;
export const DEFAULT_BUFFER_MINUTES = 20;
