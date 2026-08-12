/**
 * [2026-08-12] 마감 시각을 **통화 전에도** 만든다.
 *
 * 지금까지 마감(`deadlineAt`)은 기사님이 통화에서 골라야만 생겼다.
 * 그전까지는 `null` 이고, `null` 이면 여유가 **무한**이라 합짐이 사실상 무제한 통과했다.
 *
 * 기사님이 정한 두 원칙으로 기본값을 만든다.
 *
 *   원칙 1 (반드시)  *"일반적으로 콜을 받으면 **일과시간 전에** 가져다 주어야만 한다."*
 *   원칙 2 (가급적)  *"가급적 **이동시간을 제외하고 2시간** 안에 배송해야 한다. (그래서 통화하는 것)"*
 *
 * 통화하면 이 추정치가 실제 값으로 좁혀진다. 짐 신고의 `ESTIMATED → DECLARED` 와 같은 구조다.
 */

/** 원칙 1 — 일과 종료. 기사님 결정(2026-08-12): **17시** */
export const BUSINESS_DAY_END_HOUR = 17;

/** 원칙 2 — 이동시간을 뺀 배송 여유(분) */
export const DEFAULT_DELIVERY_SLACK_MINUTES = 120;

/**
 * 오늘(또는 이미 지났으면 내일) 일과 종료 시각.
 *
 * 17시가 지난 뒤 잡은 콜은 그날 안에 못 간다 — 다음 영업일이 마감이다.
 * (기사님: *"전날에 잡은 콜이 내일 오전 9시 도착으로 되어 있다면…"*)
 */
export function businessDayEnd(nowMs: number): number {
    const t = new Date(nowMs);
    t.setHours(BUSINESS_DAY_END_HOUR, 0, 0, 0);
    if (t.getTime() <= nowMs) t.setDate(t.getDate() + 1);
    return t.getTime();
}

/**
 * 하차 마감 기본값 = `min(도착예상 + 2시간, 일과 종료)`
 *
 * ⚠️ 일과 종료가 도착예상보다 이르면 **도착예상을 쓴다.** 마감이 도착보다 앞설 수는 없다 —
 *    그러면 여유가 음수가 되어 "이미 지각"이라고 거짓말하게 된다. 여유 0 으로 둔다.
 *
 * @param travelMinutes 지금부터 하차지 도착까지 (이동 + 앞 정거장 작업)
 */
export function defaultDropoffDeadline(nowMs: number, travelMinutes: number): string {
    const arrival = nowMs + travelMinutes * 60_000;
    const preferred = arrival + DEFAULT_DELIVERY_SLACK_MINUTES * 60_000;
    const hard = businessDayEnd(nowMs);
    return new Date(Math.max(arrival, Math.min(preferred, hard))).toISOString();
}

/**
 * 상차 마감을 **하차 마감에서 역산**한다.
 *
 * 상차 마감은 통화로 정하는 값이지만, 통화 전에도 있어야 대기 예산을 셀 수 있다.
 * 하차 마감을 지키려면 늦어도 언제까지 실어야 하는지는 계산으로 나온다.
 *
 * @param soloMinutes    상차지 → 하차지 이동
 * @param dropoffDwell   하차 작업
 */
export function derivePickupDeadline(
    dropoffDeadlineIso: string | null | undefined,
    soloMinutes: number | null | undefined,
    dropoffDwell: number,
): string | null {
    if (!dropoffDeadlineIso || soloMinutes == null) return null;
    const ms = new Date(dropoffDeadlineIso).getTime() - (soloMinutes + dropoffDwell) * 60_000;
    return new Date(ms).toISOString();
}

/**
 * **최소 출발 시각** — 이 시각까지는 출발해야 상차 약속을 지킨다.
 *
 * 기사님: *"첫 콜을 잡았다면 최소 출발 시간이 카운트다운하면 좋을 듯하다."*
 * *"1번 콜의 상차지까지 30분 걸리고 도착시간에 30분을 더했다면 난 30분 후에 출발해도 되는 것이고,
 * 그 30분 동안 현 위치에서 콜을 더 잡는 거야."*
 *
 * 그 30분이 곧 **대기 예산**이고, 여기서 카운트다운이 나온다.
 */
export function departureDeadline(
    pickupDeadlineIso: string | null | undefined,
    approachMinutes: number | null | undefined,
): string | null {
    if (!pickupDeadlineIso || approachMinutes == null) return null;
    return new Date(new Date(pickupDeadlineIso).getTime() - approachMinutes * 60_000).toISOString();
}

/** 남은 시간(분). 이미 지났으면 음수 — 0 으로 깎지 않는다. 지각은 지각이라고 말해야 한다 */
export function minutesUntil(iso: string | null | undefined, nowMs: number): number | null {
    if (!iso) return null;
    return Math.round((new Date(iso).getTime() - nowMs) / 60_000);
}

/** `28:14` 꼴 카운트다운. 지났으면 `-` 를 붙인다 */
export function formatCountdown(iso: string | null | undefined, nowMs: number): string | null {
    if (!iso) return null;
    const totalSec = Math.round((new Date(iso).getTime() - nowMs) / 1000);
    const neg = totalSec < 0;
    const s = Math.abs(totalSec);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    const body = h > 0
        ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
        : `${m}:${String(sec).padStart(2, '0')}`;
    return neg ? `-${body}` : body;
}
