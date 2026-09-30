import type { ApproxAddress } from '@onedal/shared';

/**
 * 📍 **주소 대략 알약** (기사님 «가» · onedal-1f) — 서버가 콜 주소를 못 찾아 읍·면·동 중심으로 판정했을 때
 * 판정석·상태바가 그렇게 말한다. 어느 쪽(상차·하차)이 대략인지 적는다 — 통화로 확인하실 자리다.
 * 재료는 서버가 콜 객체에 실은 `pickupApprox` · `dropoffApprox`(«마장면»). 둘 다 없으면 null.
 */
/** 판정석 한 줄 — «📍 상차 주소 대략 — 마장면 중심» · 둘 다면 «📍 상차·하차 주소 대략» */
export function approxBadgeOf(c: ApproxAddress): string | null {
    if (c.pickupApprox && c.dropoffApprox) return '📍 상차·하차 주소 대략';
    if (c.pickupApprox) return `📍 상차 주소 대략 — ${c.pickupApprox} 중심`;
    if (c.dropoffApprox) return `📍 하차 주소 대략 — ${c.dropoffApprox} 중심`;
    return null;
}

/** 상태바 짧은 꼴 «📍 대략» */
export function approxShortOf(c: ApproxAddress): string | null {
    return c.pickupApprox || c.dropoffApprox ? '📍 대략' : null;
}
