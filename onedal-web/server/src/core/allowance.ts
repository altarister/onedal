import { allowanceLive, kstDateText } from "@onedal/shared";
import db from "../db";

/**
 * 🎛️ **이 회원의 허락이 지금 살아 있나** (reviews/29 6단계 · 판단은 shared `allowanceLive` 한 곳).
 * 폰 보고(scrap)가 초당 부르지만 users 주키 한 줄이라 가볍다. 회원 줄이 없으면 둘 다 죽음(폰 문이 이미 막는다).
 */
export function allowanceOf(userId: string): { autoLive: boolean; statsLive: boolean } {
    const r = db.prepare(`SELECT auto_allowed_at, auto_until, stats_allowed_at, stats_until FROM users WHERE id = ?`).get(userId) as
        { auto_allowed_at: string | null; auto_until: string | null; stats_allowed_at: string | null; stats_until: string | null } | undefined;
    if (!r) return { autoLive: false, statsLive: false };
    const today = kstDateText(Date.now()) ?? '';
    return { autoLive: allowanceLive(r.auto_allowed_at, r.auto_until, today), statsLive: allowanceLive(r.stats_allowed_at, r.stats_until, today) };
}
