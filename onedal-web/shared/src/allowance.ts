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

/**
 * 📱 **폰에 갈 모드 — 기기 세션에서** — 명령(`mode`)과 «자동 잡기 허락이 살아 있나»(`autoAllowed` · 서버가 폰 보고마다 적는다)로 그때그때 계산한다.
 * 허락 사실이 없으면(옛 서버 · 꺼진 폰 줄) 산 것으로 — 명령 그대로. 관제웹이 명령을 바꾼 순간부터 «적용중»이 이 값과 견준다.
 */
export function phoneModeOf(d: { mode?: string; autoAllowed?: boolean }): string | undefined {
    return d.mode ? modeForPhone(d.mode, d.autoAllowed !== false) : undefined;
}

/**
 * 🎛️ **관제웹 모드 고르기 목록** — 자동 잡기 허락이 꺼진 폰(`autoAllowed === false`)은 «자동»을 그리지 않는다(못 쓰는 버튼을 보이지 않는다).
 * 끝자리는 지금 고른 것 — 폰에 갈 모드(`phoneModeOf`)라 허락이 꺼진 폰에 AUTO 명령이 남아 있어도 «알람»으로 그린다(저장된 명령은 안 건드린다).
 * 허락이 켜졌거나 허락 사실이 없는 폰은 셋 그대로 · 고른 것이 맨 뒤.
 */
export function modeChoicesOf<M extends string>(modes: readonly M[], d: { mode: M; autoAllowed?: boolean }): M[] {
    const current = (phoneModeOf(d) ?? d.mode) as M;
    const shown = modes.filter(m => d.autoAllowed !== false || m !== 'AUTO');
    return [...shown.filter(m => m !== current), current];
}
