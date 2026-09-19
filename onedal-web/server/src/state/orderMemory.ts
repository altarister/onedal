import { PendingOrder, isTerminal } from "@onedal/shared";
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

/**
 * 🚪 **콜을 메모리에 적는 유일한 문 — 종결된 콜은 되살아나지 않는다**
 *
 * `TERMINAL_STATUSES` 에 «종결 상태 (더 이상 상태 전이 없음)» 이라 적혀 있었지만 **강제하는 곳이 없었다.**
 * 상태를 정하는 권한이 호출부마다 흩어져 있어, 늦게 온 요청 하나가 죽은 콜을 심사 중으로 되돌렸다.
 *
 * 🔴 같은 모양이 세 번 났고 전부 **다른 경로**였다 (대장 #12 정리 경로 · #13 재열람 대조 · 상세 경로).
 *    그때마다 그 경로에 분기를 하나 넣었기 때문에 경로가 늘 때마다 다시 났다. 그래서 **문을 하나로** 모았다 —
 *    새 경로가 생겨도 이 문을 지나므로 저절로 지켜진다. 우회를 막는 검사는 `rules/orderMemoryGate.test.ts`.
 *
 * 🔴 **죽은 것은 장부에도 있다** — 캐시에서 지워졌어도 `myOrders` 에 종결로 남아 있으면 죽은 콜이다.
 * ⚠️ **종결 → 종결은 막지 않는다** — 서버를 다시 띄울 때 복구가 그 상태 그대로 다시 적는다.
 *
 * @returns 적었으면 `true`, 되살리기를 막았으면 `false` (부르는 쪽은 그때 하던 일을 멈춘다)
 */
export function rememberOrder(session: UserSession, order: PendingOrder | { id: string; status?: string }): boolean {
    const id = order.id;
    const prev = session.pendingOrdersData.get(id) ?? session.myOrders.find(o => o.id === id);
    if (prev && isTerminal(prev.status) && !isTerminal(order.status)) {
        console.log(`🚪 [되살리기 막음] ${id} 는 ${prev.status} 로 끝난 콜이다 — ${order.status} 로 덮지 않는다`);
        return false;
    }
    session.pendingOrdersData.set(id, order as PendingOrder);
    return true;
}
