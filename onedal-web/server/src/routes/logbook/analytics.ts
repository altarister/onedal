/**
 * /api/logbook/analytics 라우터
 *
 * Logbook 대시보드의 요약 지표(Key Metrics) API를 제공합니다.
 * 인증된 사용자의 userId 기반으로 본인의 데이터만 조회합니다.
 */

import { Router } from "express";
import { requireAuth } from "../../middlewares/authMiddleware";
import { getSummaryMetrics } from "../../services/statService";

const router = Router();

/**
 * GET /api/logbook/analytics/summary
 *
 * 응답 예시:
 * {
 *   todayRevenue: 145000,
 *   todayDistanceKm: 184.5,
 *   todayEfficiency: 786,
 *   monthRevenue: 3200000,
 *   monthDistanceKm: 4120.3,
 *   monthEfficiency: 776,
 *   unpaidTotal: 45000,
 *   todayOrderCount: 5,
 *   monthOrderCount: 87,
 * }
 */
router.get("/summary", requireAuth, (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) return res.status(401).json({ error: "Unauthorized" });

        const metrics = getSummaryMetrics(userId);
        res.json(metrics);
    } catch (error) {
        console.error("❌ [Logbook Analytics] summary 조회 실패:", error);
        res.status(500).json({ error: "통계 데이터 조회 중 오류가 발생했습니다." });
    }
});

export default router;
