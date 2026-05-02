/**
 * /api/logbook/places 라우터
 *
 * 장소 인사이트 API (단골 핫스팟 TOP N, 블랙리스트)를 제공합니다.
 * places 테이블은 userId와 무관하게 전체 공유이므로 인증만 확인합니다.
 */

import { Router } from "express";
import { requireAuth } from "../../middlewares/authMiddleware";
import { getPlaceInsights } from "../../services/statService";

const router = Router();

/**
 * GET /api/logbook/places/hotspots
 *
 * Query params:
 *   - limit: number (default: 5) — 핫스팟 상위 N개
 *
 * 응답 예시:
 * {
 *   hotspots: [
 *     { id: 1, addressDetail: "경기 화성시 ...", customerName: "쿠팡 물류센터", visitCount: 12, ... },
 *   ],
 *   blacklisted: [
 *     { id: 5, addressDetail: "성남 상대원...", rating: 1.5, blacklistMemo: "대기시간 과다" },
 *   ]
 * }
 */
router.get("/hotspots", requireAuth, (req, res) => {
    try {
        const limit = parseInt(req.query.limit as string) || 5;
        const insights = getPlaceInsights(limit);
        res.json(insights);
    } catch (error) {
        console.error("❌ [Logbook Places] hotspots 조회 실패:", error);
        res.status(500).json({ error: "장소 인사이트 조회 중 오류가 발생했습니다." });
    }
});

export default router;
