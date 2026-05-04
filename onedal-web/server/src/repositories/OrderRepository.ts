import db from "../db";
import { MyOrder, PendingOrder, SecuredOrder } from "@onedal/shared";

export class OrderRepository {
    /**
     * 오더 메인 정보를 DB에 기록합니다 (UPSERT).
     */
    public static upsertOrder(cachedOrder: PendingOrder | SecuredOrder | MyOrder, userId: string, isShared: number, isExpress: number) {
        const stmtOrder = db.prepare(`
            INSERT INTO orders (
                id, type, pickup, dropoff, fare, timestamp, status, userId, capturedAt, capturedDeviceId,
                vehicleType, distanceKm, totalDistanceKm, totalDurationMin, kakaoSoloDistanceKm, kakaoSoloDurationMin, kakaoTimeExt,
                paymentType, billingType, commissionRate, tollFare, tripType, orderForm, itemDescription, detailMemo,
                dispatcherName, dispatcherPhone, isShared, isExpress
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET 
                status = 'ORDER_CONFIRMED', 
                userId = excluded.userId, 
                capturedAt = excluded.capturedAt
        `);
        
        stmtOrder.run(
            cachedOrder.id,
            cachedOrder.type || "NEW_ORDER",
            cachedOrder.pickup,
            cachedOrder.dropoff,
            cachedOrder.fare || 0,
            cachedOrder.timestamp || new Date().toISOString(),
            "confirmed",
            userId,
            cachedOrder.capturedAt || new Date().toISOString(),
            cachedOrder.capturedDeviceId || null,
            cachedOrder.vehicleType || null,
            cachedOrder.distanceKm || null,
            cachedOrder.totalDistanceKm || null,
            cachedOrder.totalDurationMin || null,
            cachedOrder.kakaoSoloDistanceKm || null,
            cachedOrder.kakaoSoloDurationMin || null,
            cachedOrder.kakaoTimeExt || null,
            cachedOrder.paymentType || null,
            cachedOrder.billingType || null,
            cachedOrder.commissionRate || null,
            cachedOrder.tollFare || null,
            cachedOrder.tripType || null,
            cachedOrder.orderForm || null,
            cachedOrder.itemDescription || null,
            cachedOrder.detailMemo || null,
            cachedOrder.dispatcherName || null,
            cachedOrder.dispatcherPhone || null,
            isShared,
            isExpress
        );
    }

    /**
     * 수동 취소 등 상태값을 변경합니다.
     */
    public static updateOrderStatus(orderId: string, userId: string, status: string) {
        const stmt = db.prepare("UPDATE orders SET status = ? WHERE id = ? AND userId = ?");
        stmt.run(status, orderId, userId);
    }

    /**
     * 오더에 엮인 장소(경유지 등) 매핑 데이터를 기록합니다.
     */
    public static insertOrderStop(orderId: string, placeId: number, stopType: 'pickup' | 'dropoff' | 'waypoint', customerNameSnapshot: string, phoneSnapshot: string | null) {
        db.prepare(`
            INSERT INTO orderStops (orderId, placeId, stopType, customerNameSnapshot, phoneSnapshot) 
            VALUES (?, ?, ?, ?, ?)
        `).run(orderId, placeId, stopType, customerNameSnapshot, phoneSnapshot);
    }
}
