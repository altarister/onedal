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
                scheduleText, postTime, targetApp
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
     * [Phase 8.4] 정거장별 화물 신고를 저장합니다.
     * 같은 (오더, 정거장, 종류)는 덮어쓴다 — 통화를 다시 걸어 정정하는 일이 흔하다.
     */
    public static upsertCargoReport(orderId: string, userId: string, r: CargoReport) {
        db.prepare(`
            INSERT INTO stop_cargo_reports (orderId, userId, stopType, kind, unit, sizeClass, quantity, handling, promisedAt, promisedArrivalAt, deadlineAt, onwardDeadlineAt, tags, protections, memo, recordedAt)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(orderId, stopType, kind) DO UPDATE SET
                unit = excluded.unit,
                sizeClass = excluded.sizeClass,
                quantity = excluded.quantity,
                handling = excluded.handling,
                promisedAt = excluded.promisedAt,
                promisedArrivalAt = excluded.promisedArrivalAt,
                deadlineAt = excluded.deadlineAt,
                onwardDeadlineAt = excluded.onwardDeadlineAt,
                tags = excluded.tags,
                protections = excluded.protections,
                memo = excluded.memo,
                recordedAt = excluded.recordedAt
        `).run(orderId, userId, r.stopType, r.kind, r.unit || null, r.sizeClass || null, r.quantity ?? null,
               r.handling || null, r.promisedAt || null, (r as any).promisedArrivalAt || null, r.deadlineAt || null, r.onwardDeadlineAt || null,
               r.tags?.length ? JSON.stringify(r.tags) : null,
            (r as any).protections?.length ? JSON.stringify((r as any).protections) : null,
            r.memo || null, new Date().toISOString());
    }

    /** 한 오더의 모든 화물 신고 (상차/하차 × 신고값/실측값) */
    public static getCargoReports(orderId: string): CargoReport[] {
        const rows = db.prepare(`SELECT stopType, kind, unit, sizeClass, quantity, handling, promisedAt, promisedArrivalAt, deadlineAt, onwardDeadlineAt, tags, protections, memo
                                 FROM stop_cargo_reports WHERE orderId = ?`).all(orderId) as any[];
        return rows.map(r => ({ ...r, tags: r.tags ? JSON.parse(r.tags) : undefined,
                                protections: r.protections ? JSON.parse(r.protections) : undefined })) as CargoReport[];
    }

    /**
     * 약속 시각만 고친다.
     *
     * ⚠️ `upsertCargoReport` 로 하면 안 된다 — 그건 `ON CONFLICT DO UPDATE SET unit = excluded.unit, …`
     *    이라서 **넘기지 않은 필드가 전부 null 로 덮인다.** 시각 하나 고치려다 짐 정보를 날린다.
     *    계약이 좁으면 실수할 자리가 없다.
     */
    public static setStopDeadline(orderId: string, userId: string, stopType: string, deadlineAt: string | null) {
        const r = db.prepare(`UPDATE stop_cargo_reports SET deadlineAt = ?, recordedAt = ?
                              WHERE orderId = ? AND userId = ? AND stopType = ?`)
                    .run(deadlineAt, new Date().toISOString(), orderId, userId, stopType);
        // 통화 기록이 아직 없으면(적요만 보고 바로 출발) 최소 행을 만들어 둔다
        if (r.changes === 0) {
            db.prepare(`INSERT INTO stop_cargo_reports (orderId, userId, stopType, kind, deadlineAt, recordedAt)
                        VALUES (?, ?, ?, 'DECLARED', ?, ?)`)
              .run(orderId, userId, stopType, deadlineAt, new Date().toISOString());
        }
    }

    /**
     * [Phase 8 · T8] 착불 현금을 현장에서 받았는가.
     *
     * 🔴 2026-08-11 — `settlementStatus` · `unpaidAmount` 는 컬럼도 있고
     *    운행일지 미수금 화면도 있는데 **쓰는 경로가 어디에도 없었다.**
     *    기사님이 현금을 받아도 기록이 안 남아 미수금 화면이 늘 비어 있었다.
     *
     * 기사님: *"착불현금은 완료 누르기 전에 내가 받을꺼야."*
     * 그래서 하차 완료를 누르기 **직전**에 이 값을 남긴다.
     *
     * 미수(`받음=false`)면 금액을 그대로 미수금으로 올린다 — 0 으로 덮지 않는다.
     */
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
     * 잘못 누른 마일스톤을 지운다.
     *
     * 기사님 기준: *"단계별로 DB 에 저장하고 … 수정이 가능해야 한다."*
     * 도착을 잘못 눌러도 되돌릴 방법이 없었다 — 시각 기록이 영영 틀어진 채 남는다.
     */
    public static deleteMilestone(orderId: string, userId: string, milestone: string): boolean {
        const r = db.prepare(`DELETE FROM order_milestones WHERE orderId = ? AND userId = ? AND milestone = ?`)
                    .run(orderId, userId, milestone);
        return r.changes > 0;
    }

    /** 한 오더의 마일스톤 이력 (예상 대비 오차 확인용) */
    public static getMilestones(orderId: string) {
        return db.prepare(`SELECT milestone, occurredAt, predictedAt, source
                           FROM order_milestones WHERE orderId = ? ORDER BY occurredAt`).all(orderId);
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
