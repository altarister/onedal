/**
 * 💰 **쌍둥이 콜 추정 요금 꼬리** — 원달앱이 tagsText 끝에 싣는 «요금 둘 중 낮은 값 · 7,238 / 6,160».
 * 같은 가게·같은 경로 콜 둘 가운데 어느 것인지 몰라 낮은 요금으로 판정 받은 콜이다 — 판정석이 «이 요금은 추정»을 보인다.
 * 없으면 null.
 */
export function twinFareNoteOf(tagsText: string | null | undefined): { fares: string } | null {
    const m = (tagsText ?? '').match(/요금 둘 중 낮은 값 · ([\d,]+(?: \/ [\d,]+)+)\s*$/);
    return m ? { fares: m[1] } : null;
}
