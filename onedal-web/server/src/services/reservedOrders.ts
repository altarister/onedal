import { isTerminal } from "@onedal/shared";
import type { MyOrder } from "@onedal/shared";

/**
 * 📅 **예약 보관 — 내일 콜은 오늘 하루에 넣지 않는다** (reviews/23 B-1 · 기사님 «가»).
 *
 * KEEP 한 콜의 보관 날(`reservedFor`)이 오늘 뒤면 진행 중 콜(`myOrders`)이 아니라 `reservedOrders` 에 둔다.
 * 🔴 진행 중 콜을 모으는 자리(`getActiveCalls` 등 45곳)는 한 줄도 안 바뀐다 — 예약 콜이 거기 **없기** 때문이다.
 *    문은 셋: 들어가는 문(KEEP · `dispatchEngine.handleDecision`) · 나오는 문(`promoteDueReserved`) · 버리는 문(`takeReserved`).
 * 🔴 옮기는 함수는 하나, 부르는 곳은 둘 — 영업일 전환(`ensureBusinessDay`) · 서버 재시작 되살리기
 *    (새 날에 서버가 뜨면 세션이 오늘로 태어나 영업일 전환이 안 돈다).
 */

/** 오늘 뒤의 날인가 — 문자열 날짜(YYYY-MM-DD)라 글자 비교가 곧 날 비교다 */
export const isLaterThan = (reservedFor: string | null | undefined, today: string) => !!reservedFor && reservedFor > today;

/**
 * 보관 중인 콜인가 — 보관 날이 오늘 뒤이고 끝나지 않은 콜. 재시작 되살리기와 관제웹 콜 목록 문(`GET /orders`)이 같이 쓴다.
 * 끝난 예약 콜(방출)은 버리는 문을 지나 오늘 «취소/방출»에 남는다 — 장부의 `reserved_for` 는 그대로라 상태까지 봐야 한다.
 */
export const isHeldReserved = (o: { reservedFor?: string | null; status?: string }, today: string) =>
    isLaterThan(o.reservedFor, today) && !isTerminal(o.status);

/** 나오는 문 — 보관 날이 오늘(또는 지난 날)이 된 콜을 진행 중 콜로 옮긴다. 옮긴 수를 돌려준다 */
export function promoteDueReserved(session: { myOrders: MyOrder[]; reservedOrders: MyOrder[] }, today: string): number {
    const due = session.reservedOrders.filter(o => !isLaterThan(o.reservedFor, today));
    if (!due.length) return 0;
    session.reservedOrders = session.reservedOrders.filter(o => !due.includes(o));
    session.myOrders.push(...due);
    return due.length;
}

/** 버리는 문 — 예약 보관에서 그 콜을 꺼낸다. 없으면 null */
export function takeReserved(session: { reservedOrders: MyOrder[] }, orderId: string): MyOrder | null {
    const hit = session.reservedOrders.find(o => o.id === orderId) ?? null;
    if (hit) session.reservedOrders = session.reservedOrders.filter(o => o !== hit);
    return hit;
}
