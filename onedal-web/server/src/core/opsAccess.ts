import db from "../db";

/**
 * 🏢 **운영센터에 들어올 수 있나 — 판단 자리 하나** (reviews/29 3단계 · 기준 4 «기사님 = 기사 + 관리자»).
 * 로그인 토큰의 role(30일 묵는다)이 아니라 요청마다 DB 의 `users.ops_allowed_at` 을 읽는다 — 허락을 끄면 다음 요청부터 막힌다.
 * HTTP(`requireOps`)와 소켓 관리자 방(`activateUserSocket`)이 같이 부른다.
 */
export function opsAllowed(userId: string | null | undefined): boolean {
    if (!userId) return false;
    const row = db.prepare(`SELECT ops_allowed_at FROM users WHERE id = ?`).get(userId) as { ops_allowed_at: string | null } | undefined;
    return !!row?.ops_allowed_at;
}
