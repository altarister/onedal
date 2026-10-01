import type { OpsCounts } from '@onedal/shared';

/**
 * ☰ 귀퉁이 숫자 — 폰 폭에서는 메뉴가 접혀 있어 배지가 안 보인다. «전화할 콜»이 가장 급하니(KEEP 직후 바로 통화)
 * 있으면 그 수를 빨강으로, 없을 때만 나머지(승인 대기 + 끊긴 폰) 합을 흐리게. 둘 다 0 이면 없음.
 */
export function menuBadgeOf(c: OpsCounts): { n: number; urgent: boolean } | null {
    if (c.callsTodo > 0) return { n: c.callsTodo, urgent: true };
    const rest = c.pendingMembers + c.phonesOffline;
    return rest > 0 ? { n: rest, urgent: false } : null;
}
