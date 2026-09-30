/**
 * 🚧 **통과 콜이 있는데 원달앱이 안 연 까닭 — 열쇠 표** (원달앱 `OpenBlocked` · 목록 보고 `openBlocked`).
 *
 * `say` 는 관제웹 필터 통과 띠에 붙는 기사님 말이다 — 짧게.
 * `needsHand` 는 «기사님 손이 있어야 풀리나»다. 곧 스스로 풀리는 까닭(손 뒤 1.5초 · 목록이 흐름 · 판정 중 …)은
 * 띠를 안 띄운다 — 1~2초 뒤 앱이 열 콜에 «직접 여십시오»는 노이즈다.
 * 원달앱이 열쇠를 더하면 `openBlocked.test` 가 빨간불이다(앱 파일을 읽어 대조한다).
 */
export const OPEN_BLOCKED: Record<string, { say: string; needsHand: boolean }> = {
    handFirst: { say: '손을 떼면 엽니다', needsHand: false },
    alarmHeld: { say: '목록을 그리는 중', needsHand: false },
    evaluating: { say: '앞 콜 판정 중', needsHand: false },
    busy: { say: '다른 콜 상세를 여는 중', needsHand: false },
    listMoving: { say: '목록이 멈추면 엽니다', needsHand: false },
    tapRecheck: { say: '누르기 직전 조건이 바뀜', needsHand: false },
    acceptVisible: { say: '오더카드가 떠 있어 안 누름', needsHand: true },
    notUnderHeader: { say: '목록 머리줄 아래가 아님', needsHand: true },
    noWaitingBand: { say: '«오더카드 대기 중» 띠가 없음', needsHand: true },
    underBand: { say: '띠 바로 아래 줄이라 안 누름', needsHand: true },
    tabBar: { say: '맨 아래 줄이라 안 누름', needsHand: true },
    scrolledOff: { say: '내려간 목록이라 안 누름', needsHand: true },
    tapNotSent: { say: '누르기를 못 보냄', needsHand: true },
    held: { say: '까닭 없이 보류', needsHand: true },
};

/** 기사님 손이 있어야 풀리는 까닭인가 — 표에 없는 열쇠는 손 필요로 본다(지어내지 않고 띠에 그대로 보인다) */
export const openBlockedNeedsHand = (key: string | null | undefined): boolean =>
    !!key && (OPEN_BLOCKED[key]?.needsHand ?? true);

/** 띠에 붙일 까닭 — 없거나 곧 스스로 풀리면 null. 표에 없는 열쇠는 지어내지 않고 그대로 보인다 */
export function openBlockedSayOf(key: string | null | undefined): string | null {
    if (!key) return null;
    const row = OPEN_BLOCKED[key];
    if (!row) return `모르는 까닭(${key})`;
    return row.needsHand ? row.say : null;
}
