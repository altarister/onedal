import db from "../db";
import { getUserSession } from "../state/userSessionStore";

/**
 * 👥 **이 콜은 이 기사의 것인가** — 서버가 콜에 읽고 쓸 때 확인하는 한 곳 (reviews/29 기준 1 «모든 자료에 주인»).
 *
 * 참: 그 기사 세션 메모리(심사 중 · 내 콜 · 예약)에 있거나, `orders` 행의 주인이 그 기사다.
 * 체험 콜은 DB 에 안 쓰이니 메모리가 잡는다. 둘 다 없으면 거짓 — 모르는 콜은 남의 콜로 본다.
 */
export function ownsOrder(userId: string, orderId: string | null | undefined): boolean {
    if (!orderId) return false;
    const s = getUserSession(userId);
    if (s.pendingOrdersData.has(orderId)) return true;
    if (s.myOrders.some(o => o.id === orderId)) return true;
    if ((s.reservedOrders ?? []).some(o => o.id === orderId)) return true;
    const row = db.prepare(`SELECT userId FROM orders WHERE id = ?`).get(orderId) as { userId?: string | null } | undefined;
    return !!row && row.userId === userId;
}

/**
 * 👥 **남의 콜인가** — 폰이 새 콜을 올릴 때(/confirm · /detail) 쓴다. 처음 보는 콜은 남의 것이 아니다(새 콜).
 *    DB 에 주인이 따로 있을 때만 참이다.
 */
export function ownedByOther(userId: string, orderId: string | null | undefined): boolean {
    if (!orderId) return false;
    const row = db.prepare(`SELECT userId FROM orders WHERE id = ?`).get(orderId) as { userId?: string | null } | undefined;
    return !!row?.userId && row.userId !== userId;
}
