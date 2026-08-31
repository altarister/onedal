/**
 * 🧠 **시트 규칙 — v23 Ⅲ표가 곧 이 함수다** (기사님 확정 2026-08-31).
 *
 * 무대의 시트가 언제 올라가고 내려가는지를 정하는 **유일한 자리**다.
 * 화면도 타이머도 소켓도 모르는 **순수 함수**라 폰 없이 검사된다 (`stageRules.test.ts`).
 *
 * 🔴 **왜 뺐나** — 2026-08-31 하루에 이 규칙을 **다섯 번** 뒤집었는데(유예 30초 → 자동올림,
 *    자막 줄, 덱 추종, 카운트다운) 전부 **손으로** 확인했다. 이 레포의 원칙은
 *    *"있는 검사가 안 불리면 없는 것"* 인데 여기는 **애초에 검사가 없었다.**
 *    그날 «짧은 구간에서 시트가 안 내려가던 것»은 검사가 있었으면 책상에서 잡혔다.
 *
 * 표의 뜻:
 *   · 손(드래그·탭)이 이긴다 — 만진 뒤 30초는 자동이 아무것도 못 바꾼다
 *   · 자동으로 올린 시트(KEEP·도착)는 «정차»에는 이기고 «주행»에는 진다
 *   · 자동은 **높이만** 바꾼다 — 콜·필터 상태는 건드리지 않으므로 안전하다 (v23 Ⅳ)
 */
export type Snap = 'peek' | 'half' | 'full';

/** 지금 무대가 받는 신호 — 전부 밖에서 재서 넣는다 */
export interface StageSignals {
    nowMs: number;
    /** 진행 중인 콜 수 */
    calls: number;
    /** 심사 중인 콜이 있나 (S4) */
    judging: boolean;
    /** 주행/정차 — GPS 속도의 히스테리시스 결과 */
    drive: 'drive' | 'idle';
}

/** 규칙이 기억하는 것 — 이것도 밖에 두고 넣고 받는다 (숨은 상태 없음) */
export interface StageMemory {
    /** KEEP·도착이 올린 시트인가 — 정차에는 이기고 주행에는 진다 */
    autoRaised: boolean;
    /** 손이 이기는 유예의 끝 (ms). 0 이면 유예 없음 */
    userHoldUntil: number;
}

export const initialStageMemory = (): StageMemory => ({ autoRaised: false, userHoldUntil: 0 });

/** 손이 이기는 시간 — 만지면 이만큼은 자동이 아무것도 못 바꾼다 (v23 Ⅳ) */
export const USER_HOLD_MS = 30_000;

export type StageEvent =
    /** 신호가 바뀌었다 (주행/정차 · 판정 · 콜 수) */
    | { type: 'signal' }
    /** KEEP 직후 — 바로 통화해야 한다 (S5) */
    | { type: 'keep' }
    /** 정거장 도착 — 신고 시트가 마중 나간다 (S7) */
    | { type: 'arrive' }
    /** 출발(버튼 또는 국면 전환) — 이제 달린다 */
    | { type: 'depart' }
    /** 지도 정거장·이름표 탭 (S6) */
    | { type: 'tap' }
    /** 손으로 끌었다 */
    | { type: 'drag'; to: Snap };

export interface StageResult {
    mem: StageMemory;
    /** 바꿀 높이. `null` 이면 그대로 둔다 */
    snap: Snap | null;
    /** 왜 그렇게 정했나 — 로그로 남아 GPS 궤적과 대조된다 */
    reason: string;
    /**
     * 손 유예에 걸려 **미룬** 결정인가. 호출부는 유예가 끝나면 다시 물어야 한다 —
     * 안 그러면 유예 중에 온 전환이 영영 사라진다 (0831 실측: 시트가 전체에 눌러앉음).
     */
    deferred: boolean;
}

const out = (mem: StageMemory, snap: Snap | null, reason: string, deferred = false): StageResult =>
    ({ mem, snap, reason, deferred });

/**
 * 🎬 **한 걸음** — 지금 신호와 기억, 그리고 방금 일어난 일로 다음 높이를 정한다.
 * 순서가 곧 우선순위다. 위에서 걸리면 아래는 안 본다.
 */
export function stageStep(mem: StageMemory, sig: StageSignals, ev: StageEvent): StageResult {
    // ── 손이 이긴다. 만진 뒤 30초는 자동(신호)이 아무것도 못 바꾼다
    const holding = sig.nowMs < mem.userHoldUntil;

    switch (ev.type) {
        case 'drag':
            // 손으로 끈 것이 곧 의사 표현이다 — 마중은 끝나고, 30초 유예가 시작된다
            return out({ autoRaised: false, userHoldUntil: sig.nowMs + USER_HOLD_MS }, ev.to, '손');

        case 'tap':
            // 지도에서 콜을 골랐다 — 손짓이므로 유예를 준다 (S6)
            return out({ autoRaised: false, userHoldUntil: sig.nowMs + USER_HOLD_MS }, 'full', '탭');

        case 'keep':
            if (holding) return out(mem, null, 'KEEP(손 유예 중)', true);
            // 킵 직후 바로 통화 — 정차 전환이 끌어내리지 못하게 «자동 올림»으로 표시 (S5)
            return out({ ...mem, autoRaised: true }, 'full', 'KEEP');

        case 'arrive':
            if (holding) return out(mem, null, '도착(손 유예 중)', true);
            // 신고하는 동안 정차 전환이 못 끌어내린다 — 달리기 시작하면 내려간다 (S7)
            return out({ ...mem, autoRaised: true }, 'full', '도착');

        case 'depart':
            if (holding) return out(mem, null, '출발(손 유예 중)', true);
            // 달릴 참이다 — 마중은 끝난다. 주행 감지(10초)를 기다리면 그 사이 지도를 가린다
            return out({ ...mem, autoRaised: false }, 'peek', '출발');

        case 'signal':
        default:
            if (holding) return out(mem, null, '손 유예 중', true);
            if (sig.judging) {
                // S4 — 지도가 판정의 근거다 (후보 경로가 노란 점선으로 겹쳐 뜬다)
                return out({ ...mem, autoRaised: false }, 'peek', '판정중');
            }
            if (sig.drive === 'drive') {
                // S3 — 달리면 지도가 주인공. 자동으로 올라간 시트도 여기서는 진다
                return out({ ...mem, autoRaised: false }, 'peek', '주행');
            }
            // 🪜 KEEP·도착으로 올라간 시트는 «정차»가 끌어내리지 못한다
            if (mem.autoRaised) return out(mem, null, '마중 유지');
            if (sig.calls > 0) return out(mem, 'half', '정차');   // S2 — 콜 목록
            return out(mem, 'peek', '콜없음');                     // S1
    }
}
