/**
 * 📅 **콜의 날짜 — 짐작하지 않는다** (기사님 «그렇게 만든 원인을 찾아야지» · `tests/callDay.test.ts`).
 * 생성기가 상차·하차 시각을 날짜째(ISO) 싣고(`pickupAt` · `deliveryAt`), 화면은 이 두 함수로만 «오늘·낼·모레»·남은 분을 그린다.
 * 날짜가 없는 콜(옛 콜)은 null — 모르면 모른다고 둔다.
 */

/** 지금부터 달력 날로 며칠 뒤인가 — 0 오늘 · 1 내일 · 2 모레 · 날짜 없으면 null */
export function dayOffset(at: string | undefined, now: Date): number | null {
    if (!at) return null;
    const t = new Date(at);
    if (Number.isNaN(t.getTime())) return null;
    const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    return Math.round((day(t) - day(now)) / 86_400_000);
}

/** 그 시각까지 남은 분 — 지났으면 0 이하 · 날짜 없으면 null (자정을 넘어도 날짜로 잰다) */
export function minutesLeft(at: string | undefined, now: Date): number | null {
    if (!at) return null;
    const t = new Date(at).getTime();
    if (Number.isNaN(t)) return null;
    return Math.round((t - now.getTime()) / 60_000);
}
