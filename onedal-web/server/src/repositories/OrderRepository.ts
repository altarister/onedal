import db from "../db";
import { MyOrder, PendingOrder, SecuredOrder } from "@onedal/shared";
import type { CargoReport } from "@onedal/shared";

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
                dispatcherName, dispatcherPhone, isShared, isExpress,
                -- [2026-08-10] 앱은 예전부터 보내고 DB에도 컬럼이 있는데 이 목록에만 빠져 있어
                -- 16건 전부 저장되지 않고 있었다. scheduleText 는 "낼09시/급송" 같은
                -- 예약 표기의 원문이라, 이게 없으면 시간창 경로 최적화의 입력 자체가 없다.
                scheduleText, postTime
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET 
                status = 'ORDER_CONFIRMED', 
                userId = excluded.userId, 
                capturedAt = excluded.capturedAt,
                -- 재확정 시 값이 비어 들어와도 기존 값을 지우지 않는다 (PlaceRepository 와 같은 규약)
                scheduleText = COALESCE(excluded.scheduleText, scheduleText),
                postTime = COALESCE(excluded.postTime, postTime)
        `);
        
        stmtOrder.run(
            cachedOrder.id,
            cachedOrder.type || "NEW_ORDER",
            cachedOrder.pickup,
            cachedOrder.dropoff,
            cachedOrder.fare || 0,
            cachedOrder.timestamp || new Date().toISOString(),
            // [Phase 2] 레거시 소문자 'confirmed'로 저장되어 GET /api/orders 와
            // restoreAndRecalculateSession 의 status IN ('ORDER_CONFIRMED',...) 조회에서
            // 누락되던 버그 수정. ON CONFLICT 절과도 값이 일치하게 됨.
            "ORDER_CONFIRMED",
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
            isExpress,
            cachedOrder.scheduleText || null,
            cachedOrder.postTime || null
        );
    }

    /**
     * [Phase 8.4] 정거장별 화물 신고를 저장합니다.
     * 같은 (오더, 정거장, 종류)는 덮어쓴다 — 통화를 다시 걸어 정정하는 일이 흔하다.
     */
    public static upsertCargoReport(orderId: string, userId: string, r: CargoReport) {
        db.prepare(`
            INSERT INTO stop_cargo_reports (orderId, userId, stopType, kind, sizeClass, quantity, handling, promisedAt, memo, recordedAt)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(orderId, stopType, kind) DO UPDATE SET
                sizeClass = excluded.sizeClass,
                quantity = excluded.quantity,
                handling = excluded.handling,
                promisedAt = excluded.promisedAt,
                memo = excluded.memo,
                recordedAt = excluded.recordedAt
        `).run(orderId, userId, r.stopType, r.kind, r.sizeClass || null, r.quantity ?? null,
               r.handling || null, r.promisedAt || null, r.memo || null, new Date().toISOString());
    }

    /** 한 오더의 모든 화물 신고 (상차/하차 × 신고값/실측값) */
    public static getCargoReports(orderId: string): CargoReport[] {
        return db.prepare(`SELECT stopType, kind, sizeClass, quantity, handling, promisedAt, memo
                           FROM stop_cargo_reports WHERE orderId = ?`).all(orderId) as CargoReport[];
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
