/**
 * Logbook 통계 전담 서비스
 *
 * 운행일지(logbook) 화면이 쓰는 집계.
 *
 * 🏪 **거래처 집계는 기사별 칸(`user_places`)으로 가른다** — `places` 는 공용 칸(주소 · 상호)만 둔다(reviews/29 1단계 C).
 *
 * ⚠️ 지금은 기사님 혼자 쓰므로 실제 해는 없지만, 기사가 둘이 되는 순간 남의 거래처와
 *    블랙리스트가 그대로 보인다 — 그때 고칠 자리를 여기 적어 둔다.
 */

import db from "../db";
import { businessDayRange, businessMonthRange } from "@onedal/shared";

// ═══════════════════════════════════════
// 1) 대시보드 요약 지표 (KeyMetricsBoard)
// ═══════════════════════════════════════

export interface SummaryMetrics {
    todayRevenue: number;
    todayDistanceKm: number;
    todayEfficiency: number;        // 원/km
    monthRevenue: number;
    monthDistanceKm: number;
    monthEfficiency: number;
    unpaidTotal: number;
    todayOrderCount: number;
    monthOrderCount: number;
}

export function getSummaryMetrics(userId: string): SummaryMetrics {
    /* 📅 한국 영업일·영업월 [시작, 끝) — 완료 시각은 UTC 글자로 저장돼 날 글자 앞부분으로 거르면 새벽 0~9시가 어제로 간다 */
    const iso = (r: { startMs: number; endMs: number }) => [new Date(r.startMs).toISOString(), new Date(r.endMs).toISOString()];
    const [dayFrom, dayTo] = iso(businessDayRange(Date.now()));
    const [monthFrom, monthTo] = iso(businessMonthRange(Date.now()));

    // 오늘 매출/주행거리/건수
    const todayRow = db.prepare(`
        SELECT 
            COALESCE(SUM(fare), 0)            AS revenue,
            COALESCE(SUM(totalDistanceKm), 0) AS distanceKm,
            COUNT(*)                          AS orderCount
        FROM orders
        WHERE userId = ?
          AND status IN ('ORDER_DELIVERED', 'ORDER_COMPLETED')
          AND completedAt >= ? AND completedAt < ?
    `).get(userId, dayFrom, dayTo) as { revenue: number; distanceKm: number; orderCount: number };

    // 이번 달 매출/주행거리/건수
    const monthRow = db.prepare(`
        SELECT 
            COALESCE(SUM(fare), 0)            AS revenue,
            COALESCE(SUM(totalDistanceKm), 0) AS distanceKm,
            COUNT(*)                          AS orderCount
        FROM orders
        WHERE userId = ?
          AND status IN ('ORDER_DELIVERED', 'ORDER_COMPLETED')
          AND completedAt >= ? AND completedAt < ?
    `).get(userId, monthFrom, monthTo) as { revenue: number; distanceKm: number; orderCount: number };

    // 미수금 총액
    const unpaidRow = db.prepare(`
        SELECT COALESCE(SUM(unpaidAmount), 0) AS total
        FROM orders
        WHERE userId = ?
          AND settlementStatus = '미수금'
    `).get(userId) as { total: number };

    const todayEff = todayRow.distanceKm > 0
        ? Math.round(todayRow.revenue / todayRow.distanceKm)
        : 0;
    const monthEff = monthRow.distanceKm > 0
        ? Math.round(monthRow.revenue / monthRow.distanceKm)
        : 0;

    return {
        todayRevenue: todayRow.revenue,
        todayDistanceKm: todayRow.distanceKm,
        todayEfficiency: todayEff,
        monthRevenue: monthRow.revenue,
        monthDistanceKm: monthRow.distanceKm,
        monthEfficiency: monthEff,
        unpaidTotal: unpaidRow.total,
        todayOrderCount: todayRow.orderCount,
        monthOrderCount: monthRow.orderCount,
    };
}

// ═══════════════════════════════════════
// 2) 장소 인사이트 (PlaceInsightBoard)
// ═══════════════════════════════════════

export interface HotspotPlace {
    id: number;
    addressDetail: string;
    customerName: string;
    region: string;
    visitCount: number;
    lastVisitedAt: string | null;
}

export interface BlacklistedPlace {
    id: number;
    addressDetail: string;
    customerName: string;
    rating: number;
    blacklistMemo: string | null;
}

export interface PlaceInsights {
    hotspots: HotspotPlace[];
    blacklisted: BlacklistedPlace[];
}

export function getPlaceInsights(userId: string, limit: number = 5): PlaceInsights {
    const hotspots = db.prepare(`
        SELECT p.id, p.addressDetail, p.customerName, p.region, u.visitCount, u.lastVisitedAt
        FROM user_places u JOIN places p ON p.id = u.place_id
        WHERE u.user_id = ? AND u.visitCount > 0
        ORDER BY u.visitCount DESC
        LIMIT ?
    `).all(userId, limit) as HotspotPlace[];

    const blacklisted = db.prepare(`
        SELECT p.id, p.addressDetail, p.customerName, u.rating, u.blacklistMemo
        FROM user_places u JOIN places p ON p.id = u.place_id
        WHERE u.user_id = ? AND u.rating <= 2.0
        ORDER BY u.rating ASC
    `).all(userId) as BlacklistedPlace[];

    return { hotspots, blacklisted };
}
