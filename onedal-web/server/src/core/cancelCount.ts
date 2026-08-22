import { incrementDeviceStats } from "../routes/devices";

/**
 * 🧮 **취소를 세는 자리는 여기 하나다** (2026-08-22 · 미리보기 콜과 함께 신설).
 *
 * 취소 카운트는 **배차망 10회 패널티**를 세는 값이다 (용어집 §2-1). 한 건도 새면 안 되고,
 * **없던 취소를 세도 안 된다.**
 *
 * 🔴 예전에는 네 곳(`dispatchEngine` ×2 · `detail` · `emergency`)이 각자
 *    `incrementDeviceStats(…, "canceled")` 를 불렀다. 조건을 하나 더하려면 네 번 적어야 했고,
 *    그러면 한쪽만 고쳐져 갈라진다 — 이 레포가 반복해서 겪은 「목록을 손으로 나열」이다
 *    (경유 4벌 · 상태목록 3벌 · 타이머 키 4벌).
 *
 * 👀 **미리보기 콜은 세지 않는다.** 기사님이 확정을 누르기 전에 판정만 받아 본 콜이라
 *    **인성에서는 아무 일도 일어나지 않았다.** 취소할 것이 없는데 우리 장부에만 쌓이면
 *    화면이 거짓말을 한다 (2026-08-22 실측: 하루에 5건이 그렇게 쌓였다).
 */
export function countCancel(
    session: { pendingOrdersData: Map<string, any>; myOrders: any[] },
    deviceId: string | undefined,
    orderId: string,
    reason: 'DECISION_CANCEL' | 'FORCE_CANCEL' | 'TIMEOUT' | string,
    /**
     * 👀 **미리 뽑아 둔 미리보기 딱지** (2026-08-22 18:45 실측으로 추가).
     *
     * 🔴 `forceCancelEvaluatingOrder` 는 캐시를 **지운 뒤에** 이 함수를 부른다. 그러면
     *    세션에서 콜을 못 찾아 딱지를 영영 못 본다 — 미리보기인데 취소 카운트가 올랐다.
     *    **판단에 쓸 값을 지운 다음에 판단하지 않는다.** 지우기 전에 뽑아 여기로 넘긴다.
     */
    isPreviewHint?: boolean,
): void {
    if (!deviceId) return;

    const order = session.pendingOrdersData.get(orderId)
        ?? session.myOrders.find(o => o.id === orderId);

    if (isPreviewHint || order?.isPreview) {
        console.log(`   👀 [미리보기] ${orderId} — 확정 전이라 인성엔 취소가 없다. 카운트에 넣지 않는다 (reason: ${reason})`);
        return;
    }

    incrementDeviceStats(deviceId, "canceled");
    console.log(`   📈 기기(${deviceId}) 취소 카운트 +1 반영 (reason: ${reason})`);
}
