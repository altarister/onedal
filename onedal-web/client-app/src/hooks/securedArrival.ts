import type { SecuredOrder } from "@onedal/shared";
import { isEvaluating } from "@onedal/shared";

/**
 * 🟢 **새 선점이 왔을 때 관제웹 콜 목록**.
 *
 * 같은 기기의 **심사 중** 카드만 지운다 — 새 선점이 왔으면 그 기기의 먼저 온 선점은 버려진 것이다(화면 이탈·반송).
 * 🔴 심사 중 카드만 지운다 — «끝난 콜·ORDER_CONFIRMED» 만 남기고 지우면 상차한 콜(ORDER_PICKED_UP)이 합짐 선점마다 1초 싱크 전까지 사라진다.
 *    확정 뒤 단계는 서버가 진실이다 — 여기서 추측으로 지우지 않고 싱크(`sync-active-orders`)가 정리한다.
 * 같은 id 가 다시 오면 먼저 있던 것을 새 것으로 바꾼다 (안 그러면 두 장이 된다).
 */
export function withSecuredArrival(prev: SecuredOrder[], secured: SecuredOrder): SecuredOrder[] {
    const cleaned = prev.filter(order =>
        order.id !== secured.id &&
        !(order.capturedDeviceId === secured.capturedDeviceId && isEvaluating(order.status))
    );
    return [...cleaned, secured];
}
