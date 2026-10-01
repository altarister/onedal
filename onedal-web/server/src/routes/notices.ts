import { Router } from "express";
import { businessDayKey, isoKst, type OpsNotice } from "@onedal/shared";
import db from "../db";

/**
 * 📢 **기사가 보는 지금 공지** (reviews/29 3단계 · 붙일 때 requireAuth — index.ts). 올림 · 내림은 운영센터(`/api/ops/notices`).
 * 지금 공지 = 내리지 않았고(ended_at 빔) · 기한이 비었거나 오늘(한국 날) 이후. 내린 공지도 줄은 남는다.
 */
const router = Router();

export type NoticeRow = { id: number; text: string; posted_at: string; active_until: string | null; ended_at: string | null };
export const noticeOf = (r: NoticeRow): OpsNotice => ({ id: r.id, text: r.text, postedAt: isoKst(r.posted_at) ?? '', activeUntil: r.active_until, endedAt: isoKst(r.ended_at) });

router.get("/active", (_req, res) => {
    const today = businessDayKey(Date.now());
    const rows = db.prepare(`SELECT * FROM notices WHERE ended_at IS NULL AND (active_until IS NULL OR active_until >= ?) ORDER BY id DESC`).all(today) as NoticeRow[];
    res.json(rows.map(noticeOf));
});

export default router;
