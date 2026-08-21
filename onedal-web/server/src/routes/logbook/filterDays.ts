/**
 * /api/logbook/filter-days — 📊 **설정과 성과** (필터 정의 4장 · 확정안 구현 6의 조회면)
 *
 * "이 설정이 얼마를 벌었나" — 자정 전환이 남긴 filter_day_results 를 그대로 준다.
 * 콜할인율·반경을 감이 아니라 성과로 정하게 하는 화면(운행일지)의 재료다.
 * 기록은 ensureBusinessDay → recordDayResult 하나가 쓴다 — 여기는 읽기만.
 */
import { Router } from "express";
import { requireAuth } from "../../middlewares/authMiddleware";
import db from "../../db";

const router = Router();

router.get("/", requireAuth, (req, res) => {
    try {
        const userId = req.user!.id;
        const limit = Math.min(90, Math.max(1, parseInt(String(req.query.limit ?? '30'), 10) || 30));
        const rows = db.prepare(`
            SELECT day, settings, revenue, calls, cancels, colors
            FROM filter_day_results WHERE user_id = ?
            ORDER BY day DESC LIMIT ?`).all(userId, limit) as any[];
        res.json({
            days: rows.map(r => ({
                day: r.day,
                revenue: r.revenue,
                calls: r.calls,
                cancels: JSON.parse(r.cancels || '{}'),
                colors: JSON.parse(r.colors || '{}'),
                settings: JSON.parse(r.settings || '{}'),
            })),
        });
    } catch (e) {
        console.error("filter-days GET 에러:", e);
        res.status(500).json({ error: "서버 오류발생" });
    }
});

export default router;
