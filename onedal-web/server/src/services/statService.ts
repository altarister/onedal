/**
 * Logbook 통계 전담 서비스
 *
 * Dashboard_PRD.md의 데이터 매핑 기준으로 v5 스키마를 조회합니다.
 * 모든 쿼리는 userId 기반이므로 다중 기사 환경에서도 안전합니다.
 */

import db from "../db";

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
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10); // YYYY-MM-DD
    const monthStr = todayStr.slice(0, 7);              // YYYY-MM

    // 오늘 매출/주행거리/건수
    const todayRow = db.prepare(`
        SELECT 
            COALESCE(SUM(fare), 0)            AS revenue,
            COALESCE(SUM(totalDistanceKm), 0) AS distanceKm,
            COUNT(*)                          AS orderCount
        FROM orders
        WHERE userId = ?
          AND status IN ('confirmed', 'completed')
          AND capturedAt LIKE ?
    `).get(userId, `${todayStr}%`) as { revenue: number; distanceKm: number; orderCount: number };

    // 이번 달 매출/주행거리/건수
    const monthRow = db.prepare(`
        SELECT 
            COALESCE(SUM(fare), 0)            AS revenue,
            COALESCE(SUM(totalDistanceKm), 0) AS distanceKm,
            COUNT(*)                          AS orderCount
        FROM orders
        WHERE userId = ?
          AND status IN ('confirmed', 'completed')
          AND capturedAt LIKE ?
    `).get(userId, `${monthStr}%`) as { revenue: number; distanceKm: number; orderCount: number };

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

export function getPlaceInsights(limit: number = 5): PlaceInsights {
    const hotspots = db.prepare(`
        SELECT id, addressDetail, customerName, region, visitCount, lastVisitedAt
        FROM places
        WHERE visitCount > 0
        ORDER BY visitCount DESC
        LIMIT ?
    `).all(limit) as HotspotPlace[];

    const blacklisted = db.prepare(`
        SELECT id, addressDetail, customerName, rating, blacklistMemo
        FROM places
        WHERE rating <= 2.0
        ORDER BY rating ASC
    `).all() as BlacklistedPlace[];

    return { hotspots, blacklisted };
}
