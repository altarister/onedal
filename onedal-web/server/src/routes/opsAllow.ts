import { Router } from "express";
import type { OpsAllowRequest, OpsPaidUntilRequest } from "@onedal/shared";
import { memberWrite } from "./ops";

/**
 * 🎛️ **운영센터 허락 · 유료 기한 문** (reviews/29 6단계 · `/api/ops` 와 같은 문지기로 index.ts 에서 붙는다 · 기록은 ops.ts `memberWrite` 가 남긴다).
 * 켜기는 허락 시각이 이미 있으면 그대로 · 없으면 지금. 끄기는 허락 시각만 비운다(기한은 둔다). 날짜는 «YYYY-MM-DD» 또는 비움(= 기한 없음).
 */
const router = Router();
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const dayOrNull = (v: unknown): string | null | undefined => v == null ? null : typeof v === 'string' && DAY.test(v) ? v : undefined;

router.post("/members/:id/allow", (req, res) => {
    const { what, on, until } = (req.body ?? {}) as Partial<OpsAllowRequest>;
    const day = dayOrNull(until);
    if ((what !== 'auto' && what !== 'stats') || typeof on !== 'boolean' || day === undefined) return res.status(400).json({ error: "허락 칸을 확인해 주세요." });
    const col = what === 'auto' ? 'auto' : 'stats';
    const label = what === 'auto' ? '자동 잡기' : '통계';
    return on
        ? memberWrite(req, res, `${label} 허락 켬`, `UPDATE users SET ${col}_allowed_at = COALESCE(${col}_allowed_at, datetime('now', 'localtime')), ${col}_until = ? WHERE id = ?`, [day], { detail: day ? `${day} 까지` : '기한 없음' })
        : memberWrite(req, res, `${label} 허락 끔`, `UPDATE users SET ${col}_allowed_at = NULL WHERE id = ?`, []);
});

router.post("/members/:id/paid-until", (req, res) => {
    const day = dayOrNull(((req.body ?? {}) as Partial<OpsPaidUntilRequest>).until);
    if (day === undefined) return res.status(400).json({ error: "날짜는 YYYY-MM-DD 또는 비움입니다." });
    return memberWrite(req, res, '유료 기한', `UPDATE users SET paid_until = ? WHERE id = ?`, [day], { detail: day ?? '기한 없음' });
});

export default router;
