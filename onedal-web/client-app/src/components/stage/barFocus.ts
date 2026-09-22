/**
 * 🎬 **시트 상태바가 가리키는 «그 콜 · 그 단계»** (기사님).
 *
 * 기사님: *"시트가 맨위로 올라가면 무조건 현황판(시트 상태바)에 표기된 스텝이 표기 되어야 하는데."*
 *
 * 🔴 **단계를 정하는 곳은 여기 하나다.** 카드가 도착 사건을 따로 듣고 «도착 단계»를 열면
 *    상태바·장부와 다른 단계가 뜬다. 상태바(`sheetStatus`)가 읽는 재료(`arrivedHere` · `next`)를 그대로 받는다.
 *    · 도착 곁이면 → 그 콜의 도착 단계 (상태바: «✅ 10 초월읍 하차 도착»)
 *    · 아니면 → 다음 정거장 콜의 **지금 할 단계** — `step: null` 이면 장부(`stepCurIdx`)가 정한다
 */
export interface BarFocus {
    orderId: string;
    step: 'ARRIVE_PICKUP' | 'ARRIVE_DROPOFF' | null;
}

export function barFocusOf(i: {
    arrivedHere: { orderId: string; stop: '상차' | '하차' } | null;
    next: { orderId: string } | null;
}): BarFocus | null {
    if (i.arrivedHere) {
        return { orderId: i.arrivedHere.orderId, step: i.arrivedHere.stop === '상차' ? 'ARRIVE_PICKUP' : 'ARRIVE_DROPOFF' };
    }
    if (i.next) return { orderId: i.next.orderId, step: null };
    return null;
}
