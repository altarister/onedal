import { accountBlocked, businessDayKey, isTerminal } from "@onedal/shared";
import db from "../db";
import { peekUserSession } from "../state/userSessionStore";

/**
 * 🚧 **이 계정이 새 일을 받나 — 서버의 판단 자리 하나** (reviews/29 2단계 · shared `accountBlocked` 를 부른다).
 * 폰 문(`authDevice`) · 폰 연결(`/api/devices/pair`) · 내 가입 상태(`/api/join/me`)가 같이 부른다.
 * - 사실 칸: users 의 approved_at · suspended_at · suspend_after_active · withdrawn_at (유료 기한 paid_until 은 6단계 칸 — 그 전엔 null)
 * - 진행 중 콜: 그 기사 세션의 끝나지 않은 콜 — «끝난 뒤» 정지가 운행 중간에 폰을 끊지 않게(끊으면 안전취소가 멈춘다).
 *   세션이 없으면 진행 중 콜도 없다(세션을 새로 만들지 않는다)
 * - 🔴 회원 줄이 없으면 막는다 — 계정 없는 폰 보고는 받지 않는다
 */
export interface AccountFacts {
    approvedAt: string | null;
    suspendedAt: string | null;
    suspendAfterActive: boolean;
    withdrawnAt: string | null;
    paidUntil: string | null;
}

export function accountFactsOf(userId: string): AccountFacts | null {
    const row = db.prepare(`SELECT approved_at, suspended_at, suspend_after_active, withdrawn_at FROM users WHERE id = ?`).get(userId) as
        { approved_at: string | null; suspended_at: string | null; suspend_after_active: number | null; withdrawn_at: string | null } | undefined;
    if (!row) return null;
    return { approvedAt: row.approved_at, suspendedAt: row.suspended_at, suspendAfterActive: !!row.suspend_after_active, withdrawnAt: row.withdrawn_at, paidUntil: null };
}

export function hasActiveCall(userId: string): boolean {
    return (peekUserSession(userId)?.myOrders ?? []).some(o => !isTerminal(o.status));
}

export function accountGateOf(userId: string): { blocked: boolean; facts: AccountFacts | null } {
    const facts = accountFactsOf(userId);
    if (!facts) return { blocked: true, facts: null };
    return { blocked: accountBlocked(facts, businessDayKey(Date.now()), hasActiveCall(userId)), facts };
}
