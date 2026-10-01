import { Router } from "express";
import { requireAuth, requireOps } from "../middlewares/authMiddleware";
import { recentNewWords } from "../services/screenWords";

/**
 * 📰 **현황판 «새 글자» 줄의 읽기 문** (reviews/24) — 새로고침해도 최근 처음 본 낱말이 남게.
 *    새 낱말이 생기는 순간은 소켓 `screen-word-new` 가 알린다 — 이 문은 처음 그릴 때 한 번 읽는다.
 *    쓰기는 원달앱 보고(`/api/scrap` 의 screenWords) 한 곳뿐이다.
 */
const router = Router();

/* 👥 관리자만 — 배차망 화면 글은 모든 기사 폰이 모은 공통 자료다 (reviews/29 기준 1) */
router.get("/recent", requireAuth, requireOps, (req, res) => {
    const days = Math.min(Math.max(Number(req.query.days) || 7, 1), 30);
    res.json({ words: recentNewWords(days) });
});

export default router;
