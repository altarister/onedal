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
                vehicleType, distanceKm, totalDistanceKm, totalDurationMin, kakaoSoloDistanceKm, kakaoSoloDurationMin, kakaoTimeExt, routeComputedAt,
                paymentType, billingType, commissionRate, tollFare, tripType, orderForm, itemDescription, detailMemo,
                dispatcherName, dispatcherPhone, isShared, isExpress,
                -- [2026-08-10] 앱은 예전부터 보내고 DB에도 컬럼이 있는데 이 목록에만 빠져 있어
                -- 16건 전부 저장되지 않고 있었다. scheduleText 는 "낼09시/급송" 같은
                -- 예약 표기의 원문이라, 이게 없으면 시간창 경로 최적화의 입력 자체가 없다.
                scheduleText, postTime, targetApp
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET 
                status = 'ORDER_CONFIRMED', 
                userId = excluded.userId, 
                capturedAt = excluded.capturedAt,
                -- 재확정 시 값이 비어 들어와도 기존 값을 지우지 않는다 (PlaceRepository 와 같은 규약)
                scheduleText = COALESCE(excluded.scheduleText, scheduleText),
                postTime = COALESCE(excluded.postTime, postTime),
                targetApp = COALESCE(excluded.targetApp, targetApp)
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
            (cachedOrder as any).routeComputedAt || null,   // ⚓ 타임라인 추정 약속의 닻
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
            cachedOrder.postTime || null,
            (cachedOrder as any).targetApp || null
        );
    }

    /**
     * 🔄 옛 장부(stop_cargo_reports · order_milestones) 함수들은 철거됐다 (기사님 확인
     * 2026-08-21). 신고·마일스톤의 유일한 원천은 여섯 단계 행이고, 읽기는
     * stepSeeder.stepRecordsOf 하나다. 정산(cod·settlement)은 orders 테이블이라 남는다.
     */

    /** 착불 수령 기록 — orders 테이블 (정산은 별도 페이지의 일) */
    public static setCodCollected(orderId: string, userId: string, received: boolean, amount: number) {
        db.prepare(`UPDATE orders
                    SET settlementStatus = ?, unpaidAmount = ?, settledAt = ?
                    WHERE id = ? AND userId = ?`)
          .run(
              received ? '수령' : '미수금',
              received ? 0 : (amount || 0),
              received ? new Date().toISOString() : null,
              orderId, userId,
          );
    }

    /** 한 오더의 정산 상태 (착불 수령 여부 표시용) */
    public static getSettlement(orderId: string): { settlementStatus?: string; unpaidAmount?: number; settledAt?: string } {
        return (db.prepare(`SELECT settlementStatus, unpaidAmount, settledAt FROM orders WHERE id = ?`)
                  .get(orderId) as any) || {};
    }

    /**
     * 🎨 판정 스냅샷 — **심사 시 1회 저장, 불변** (판정색 확정안 v2 ③).
     * 재심사(재탐색)가 와도 덮지 않는다 — INSERT OR IGNORE. 색이 나중에 바뀌면
     * "믿고 눌렀는데"가 무너진다 (기사님 확정 ④).
     */
    public static saveJudgment(orderId: string, userId: string,
        v: { color: string; score: number; axes: unknown; gates: unknown; tags: unknown }) {
        db.prepare(`INSERT OR IGNORE INTO order_judgments (orderId, userId, color, score, detail, judgedAt)
                    VALUES (?, ?, ?, ?, ?, ?)`)
          .run(orderId, userId, v.color, v.score,
               JSON.stringify({ axes: v.axes, gates: v.gates, tags: v.tags }), new Date().toISOString());
    }

    public static getJudgment(orderId: string):
        { color: string; score: number; detail: any; judgedAt: string } | null {
        const r = db.prepare(`SELECT color, score, detail, judgedAt FROM order_judgments WHERE orderId = ?`)
                    .get(orderId) as any;
        return r ? { ...r, detail: JSON.parse(r.detail) } : null;
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
