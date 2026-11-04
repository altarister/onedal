/**
 * 🚧 **통과 콜이 있는데 원달앱이 안 연 까닭 — 열쇠 표** (원달앱 `OpenBlocked` · 목록 보고 `openBlocked`).
 *
 * 서버가 필터 통과 알림 로그에 열쇠를 적고, 사람이 읽을 때 `say` 로 뜻을 찾는다 — 화면에 띄우는 값이 아니다.
 * 원달앱이 열쇠를 더하면 `openBlocked.test` 가 빨간불이다(앱 파일을 읽어 대조한다).
 */
export const OPEN_BLOCKED: Record<string, { say: string }> = {
    handFirst: { say: '손을 떼면 엽니다' },
    alarmHeld: { say: '목록을 그리는 중' },
    evaluating: { say: '앞 콜 판정 중' },
    busy: { say: '다른 콜 상세를 여는 중' },
    listMoving: { say: '목록이 멈추면 엽니다' },
    tapRecheck: { say: '누르기 직전 조건이 바뀜' },
    acceptVisible: { say: '오더카드가 떠 있어 안 누름' },
    notUnderHeader: { say: '목록 머리줄 아래가 아님' },
    noWaitingBand: { say: '«오더카드 대기 중» 띠가 없음' },
    underBand: { say: '띠 바로 아래 줄이라 안 누름' },
    tabBar: { say: '맨 아래 줄이라 안 누름' },
    scrolledOff: { say: '내려간 목록이라 안 누름' },
    tapNotSent: { say: '누르기를 못 보냄' },
    held: { say: '까닭 없이 보류' },
};
