/**
 * 🎛️ **허락이 지금 살아 있나 — 한 곳** (reviews/29 6단계 · 서버 `core/allowance` · 운영센터 회원 표가 같이 쓴다).
 * 허락 시각이 있고, 기한이 비었거나(= 기한 없음) 기한 날이 오늘(한국 달력 날 · `kstDateText`) 이후면 산다.
 * 부품은 이 사실 하나만 본다 — «등급» 같은 상태 이름 칸은 없다.
 */
export function allowanceLive(allowedAt: string | null | undefined, until: string | null | undefined, today: string): boolean {
    if (!allowedAt) return false;
    return !until || until >= today;
}

/**
 * 📱 **폰에 내려보낼 모드** — 관제웹 명령이 AUTO 인데 자동 잡기 허락이 안 살았으면 ALARM, 아니면 명령 그대로.
 * 원달앱은 받은 모드를 따른다(앱 코드 무변화). 관제웹 명령(세션 mode)은 바꾸지 않는다 — 내려보내는 값만.
 */
export function modeForPhone(command: string, autoLive: boolean): string {
    return command === 'AUTO' && !autoLive ? 'ALARM' : command;
}
