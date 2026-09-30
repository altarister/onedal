/**
 * 🔔 **필터 통과 띠 문구** — 원달앱이 상세까지 열고 확정·수락은 기사님이 누른다.
 * 픽커 목록이 내려가 «리스트 설정» 머리가 안 보이면 앱이 콜 줄을 못 가려 열지 않는다 — 그때는 기사님이 올리거나 직접 여신다.
 */
export function filterAlarmLine(alarm: { passed: number; listHeaderHidden?: boolean }, appLabel: string): string {
    const head = `${appLabel}필터 통과 ${alarm.passed}건 — `;
    return head + (alarm.listHeaderHidden
        ? '목록이 내려가 앱이 못 엽니다 — 맨 위로 올리거나 직접 여십시오'
        : '상세에서 확정·수락은 기사님이 누르십시오');
}
