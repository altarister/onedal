import { PendingOrder } from "@onedal/shared";
import { UserSession } from "./userSessionStore";

/**
 * 🧠 **같은 콜의 새 표현을 만들 때는 앞의 기억에서 시작한다.**
 *
 * 콜 하나는 살아 있는 동안 여러 번 다시 조립된다 —
 * 리스트에서 확정(`/orders/confirm`) → 상세 수집(`/orders/detail`) → 확정 승격(`handleDecision`).
 * 그때마다 **앱이 보낸 payload 에서 새로 시작하면, 그 사이 서버가 알아낸 것이 통째로 버려진다.**
 *
 * 🔴 실제로 두 번 같은 사고가 났다 (같은 클래스, 다른 증상):
 *   · 2026-08-17 경로 재탐색 — 심사 캐시만 고치고 활성 콜을 안 고쳐 앱이 옛 지역으로 필터링 (`95161b6`)
 *   · 2026-08-18 `targetApp` — `/confirm` 이 넣은 값을 `/detail` 이 새 객체로 덮어써 **13행 전부 NULL**
 *
 * 첫 번째를 고칠 때 **그 자리만** 고쳤기 때문에 두 번째가 왔다. 그래서 자리를 없앤다.
 *
 * ⚠️ `patch` 가 이긴다 — 새로 알아낸 값이 옛 기억을 덮는 것은 맞다.
 *    다만 `patch` 에 **없는 키**는 앞의 기억이 그대로 살아남는다. 그게 이 함수의 전부다.
 */
export function evolveOrder<T extends object>(
    session: UserSession,
    orderId: string,
    patch: T,
): PendingOrder & T {
    const prev = session.pendingOrdersData.get(orderId);
    return { ...(prev ?? {}), ...patch } as PendingOrder & T;
}
