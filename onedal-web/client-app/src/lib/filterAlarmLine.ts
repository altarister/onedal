import { openBlockedSayOf } from '@onedal/shared';

/**
 * 🔔 **필터 통과 띠 문구 — 기사님 손이 할 일이 있을 때만** (기사님 «스캔앱에 누를 것이 없는데 계속 나온다 — 저 노티는 지우는 것이 맞다»).
 * 원달앱이 통과 콜을 못 열었고, 그 까닭이 기사님 손이 있어야 풀리는 것일 때만 까닭과 함께 직접 여시라고 띠를 띄운다.
 * 앱이 열었거나(까닭 없음) 곧 스스로 풀리는 까닭이면 띠가 없다 — null. 알람 소리는 그대로 난다(`useSystemAlerts`). 세 배차망이 같이 쓴다.
 */
export function filterAlarmLine(alarm: { passed: number; openBlocked?: string }, appLabel: string): string | null {
    const why = openBlockedSayOf(alarm.openBlocked);
    if (!why) return null;
    return `${appLabel}필터 통과 ${alarm.passed}건 — 앱이 못 열었습니다: ${why} — 직접 여십시오`;
}
