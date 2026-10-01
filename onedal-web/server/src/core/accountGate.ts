import { accountBlocked, businessDayKey, isTerminal, IN_PROGRESS_STATUSES, restoreWindow } from "@onedal/shared";
import db from "../db";
import { peekUserSession } from "../state/userSessionStore";

/**
 * 🚧 **이 계정이 새 일을 받나 — 서버의 판단 자리 하나** (reviews/29 2단계 · shared `accountBlocked` 를 부른다).
 * 폰 문(`authDevice`) · 폰 연결(`/api/devices/pair`) · 내 가입 상태(`/api/join/me`)가 같이 부른다.
 * - 사실 칸: users 의 approved_at · suspended_at · suspend_after_active · withdrawn_at (유료 기한 paid_until 은 6단계 칸 — 그 전엔 null)
 * - 진행 중 콜: 그 기사 세션의 끝나지 않은 콜 **또는** DB orders 의 미완료 콜 — «끝난 뒤» 정지가 운행 중간에 폰을 끊지 않게
 *   (끊으면 결재가 폰에 안 가고, 앱이 계약한 콜은 안전취소 끝에 앱이 스스로 «취소»를 누른다).
 *   🔴 세션만 보면 서버가 다시 뜬 직후(세션 빔) 진행 중 콜을 «없음»으로 본다(onedal-04 교차 리뷰). DB 는 재부팅 복구와 같은 창
 *   (어제 영업일부터의 미완료 · shared `restoreWindow`)만 본다 — 닫히지 않은 옛 줄이 정지를 영원히 미루지 않게. 체험 콜은 메모리에만 있어 세션 쪽이 본다
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
    if ((peekUserSession(userId)?.myOrders ?? []).some(o => !isTerminal(o.status))) return true;
    const { unfinishedSinceIso } = restoreWindow(Date.now());
    const marks = IN_PROGRESS_STATUSES.map(() => '?').join(', ');
    return !!db.prepare(`SELECT 1 FROM orders WHERE userId = ? AND status IN (${marks}) AND timestamp >= ? LIMIT 1`).get(userId, ...IN_PROGRESS_STATUSES, unfinishedSinceIso);
}

export function accountGateOf(userId: string): { blocked: boolean; facts: AccountFacts | null } {
    const facts = accountFactsOf(userId);
    if (!facts) return { blocked: true, facts: null };
    return { blocked: accountBlocked(facts, businessDayKey(Date.now()), hasActiveCall(userId)), facts };
}
