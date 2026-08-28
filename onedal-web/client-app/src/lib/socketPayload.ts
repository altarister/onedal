/**
 * 🔌 **소켓 페이로드에서 콜 id 를 꺼내는 유일한 자리** (2026-08-29)
 *
 * 서버는 «이 콜 끝났다»를 두 이벤트로 알리는데 **모양이 다르다** —
 * ```
 * order-confirmed  →  orderId          (문자열)
 * order-canceled   →  { id, status }   (객체)
 * ```
 * 둘을 같은 핸들러에 물리면서 문자열로만 받아, 취소 쪽 경고가 **한 번도 안 지워졌다**
 * (안전취소 경고 배너가 끝난 콜에 계속 남았다). 모양을 아는 자리를 늘리지 않고
 * 여기 하나로 모은다 (규칙 ③) — 새 이벤트가 생겨도 푸는 법은 한 곳이다.
 *
 * ⚠️ 서버의 두 모양을 **하나로 합치는 것이 더 옳다.** 다만 그건 앱·관제웹이 같이
 *    움직여야 하는 일이라, 지금은 받는 쪽에서 흡수한다. 합치게 되면 이 함수가
 *    한 갈래로 줄어들 뿐 사라지지는 않는다.
 */
export function orderIdOf(payload: unknown): string | null {
    if (typeof payload === 'string') return payload || null;
    if (payload && typeof payload === 'object') {
        const id = (payload as { id?: unknown }).id;
        if (typeof id === 'string' && id) return id;
    }
    return null;   // 모르는 모양이면 지어내지 않는다 (규칙 ④)
}
