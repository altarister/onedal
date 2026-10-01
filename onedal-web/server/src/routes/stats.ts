import { Router } from "express";
import { allowanceOf } from "../core/allowance";
import { requireAuth, requireOps } from "../middlewares/authMiddleware";
import { flowRowsBetween, flowsForViewer, flowsForAdmin, rolledUpDaysBetween, FLOW_GROUP_BYS, type FlowGroupBy } from "../services/callFlowStats";
import { businessDayKey } from "@onedal/shared";
import type { FlowsViewerReply, FlowsAdminReply } from "@onedal/shared";

/**
 * 📊 **콜 흐름 통계 읽는 문 둘** (reviews/25 3단계 · 1f 결정 ②) — 쓰기는 하루 묶기(`services/callFlowStats.ts`) 한 곳뿐이다.
 *    관제웹·뉴스레터: 기사 칸 없음 · 내 줄 그대로 · 남이 섞인 칸은 남의 기사 3명 이상일 때만 합계.
 *    어드민: 인증 + 관리자 · 기사 칸.
 *    `from`·`to` 는 영업일 `YYYY-MM-DD`(없으면 최근 28일) · `groupBy` 는 weekday · hour · month · season · day · weekdayHour(기본 weekday).
 */
const router = Router();

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
export function rangeOf(q: any): { from: string; to: string; by: FlowGroupBy } {
    const today = businessDayKey(Date.now());
    const ago = businessDayKey(Date.now() - 28 * 86_400_000);
    const by = (FLOW_GROUP_BYS as readonly string[]).includes(q.groupBy) ? q.groupBy as FlowGroupBy : 'weekday';
    return { from: DAY_RE.test(q.from) ? q.from : ago, to: DAY_RE.test(q.to) ? q.to : today, by };
}

router.get("/flows", requireAuth, (req, res) => {
    /* 🎛️ 통계 허락이 안 살았으면 거절 — 아침 카드는 실패하면 안 그린다 (reviews/29 6단계) */
    if (!allowanceOf(req.user!.id).statsLive) return res.status(403).json({ error: 'STATS_NOT_ALLOWED' });
    const { from, to, by } = rangeOf(req.query);
    /* 📅 days — 그 기간에 묶인 날(아침 카드의 «주마다 N건» 나눗수 · 표본 날 수) */
    const body: FlowsViewerReply = { from, to, groupBy: by, days: rolledUpDaysBetween(from, to), cells: flowsForViewer(flowRowsBetween(from, to), req.user!.id, by) };
    res.json(body);
});

router.get("/flows/admin", requireAuth, requireOps, (req, res) => {
    const { from, to, by } = rangeOf(req.query);
    const body: FlowsAdminReply = { from, to, groupBy: by, cells: flowsForAdmin(flowRowsBetween(from, to), by) };
    res.json(body);
});

export default router;
