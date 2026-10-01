import { Router } from "express";
import { requireAuth, requireOps } from "../middlewares/authMiddleware";
import { recentNewWords } from "../services/screenWords";

/**
 * 📰 **«새 글자» 읽기 문** (reviews/24) — 최근 처음 본 낱말 목록. 운영센터 회원 상세는 같은 함수(`recentNewWords`)를 /api/ops/board/member 로 읽는다.
 *    쓰기는 원달앱 보고(`/api/scrap` 의 screenWords) 한 곳뿐이다.
 */
const router = Router();

/* 👥 관리자만 — 배차망 화면 글은 모든 기사 폰이 모은 공통 자료다 (reviews/29 기준 1) */
router.get("/recent", requireAuth, requireOps, (req, res) => {
    const days = Math.min(Math.max(Number(req.query.days) || 7, 1), 30);
    res.json({ words: recentNewWords(days) });
});

export default router;
