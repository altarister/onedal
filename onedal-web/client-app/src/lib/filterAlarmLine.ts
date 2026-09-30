/**
 * 🔔 **필터 통과 띠 문구 — 기사님 손이 할 일이 있을 때만** (기사님 «스캔앱에 누를 것이 없는데 계속 나온다 — 저 노티는 지우는 것이 맞다»).
 * 픽커 목록이 내려가 «리스트 설정» 머리가 안 보이면 앱이 콜 줄을 못 가려 열지 않는다 — 그때만 올리거나 직접 여시라고 띠를 띄운다.
 * 보통 갈래(앱이 상세까지 연다)는 띠가 없다 — null. 알람 소리는 그대로 난다(`useSystemAlerts`). 세 배차망이 같이 쓴다.
 */
export function filterAlarmLine(alarm: { passed: number; listHeaderHidden?: boolean }, appLabel: string): string | null {
    if (!alarm.listHeaderHidden) return null;
    return `${appLabel}필터 통과 ${alarm.passed}건 — 목록이 내려가 앱이 못 엽니다 — 맨 위로 올리거나 직접 여십시오`;
}
