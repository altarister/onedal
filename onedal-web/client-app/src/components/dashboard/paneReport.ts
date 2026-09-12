/**
 * 🌱 **트랙이 부모에게 알릴 장 — 순수 함수** (서버 진단 · 기사님 확정 2026-09-12 밤).
 *
 * ── 왜 생겼나 ──
 * 도착이 «지금 할 단계»로 장을 열면 트랙이 거기까지 넘어가는데, **그 도중의 스크롤
 * 이벤트가 옛 번호를 알렸다.** 부모는 그 말을 믿고 장을 되돌렸고, 둘이 서로를 밀며
 * 엉뚱한 장에서 멈췄다 — 실측으로 254ms 안에 네 번 튀었다 (`4 → 5 → 4 → 0 → 1`).
 *
 * 🔴 **스크롤 이벤트는 «누가 움직였나»를 말해 주지 않는다.** 그래서 원인이 아니라
 *    **자리**로 가른다 — 장 경계(격자)에 붙어 있으면 «멈춘 것», 사이에 있으면 «움직이는 중».
 *    움직이는 중에는 아무것도 알리지 않는다. 깃발을 들지 않으므로 **끄는 것을 잊을 수 없다**
 *    (관제웹 CLAUDE.md — 켜는 건 안 잊는데 끄는 걸 잊어서 화면이 거짓말한 그 모양).
 *
 * 🟢 **`behavior:'smooth'` 는 함께 버렸다** (기사님 확정). 이 부품 머리가 스스로
 *    *"애니메이션을 얹지 않는다"* 고 적어 두고 있었고 열릴 때는 이미 `auto` 였다.
 *    애니메이션이 없으면 중간 자리가 없으니 이 판단은 **겹쳐 둔 장치**다 (규칙 ②).
 *
 * ⚠️ **그래도 남긴다** — 애니메이션과 무관하게 남는 두 자리가 있다:
 *      · 창 폭이 바뀌면 **같은 px 가 다른 장**이 된다 (트랙은 px 를 들고 있다)
 *      · 고무줄 스크롤은 **없는 장**을 가리킨다 (음수 · 끝 너머)
 *
 * 🔬 검사는 `paneReport.test.ts`.
 */

/** 스냅이 이만큼 어긋나게 멈추는 것은 «붙은 것»으로 본다 (트랙의 `scrollTo` 도 같은 눈금을 쓴다) */
export const PANE_SNAP_TOLERANCE_PX = 4;

export function reportedPaneOf(
    scrollLeft: number,
    clientWidth: number,
    /** 장이 몇 개인가 — 없는 장을 가리키지 않으려고 받는다 */
    count: number,
    /** 부모가 «지금 보는 곳»이라 알고 있는 장 */
    shownIdx: number,
    tolerancePx: number = PANE_SNAP_TOLERANCE_PX,
): number | null {
    /* 🔴 접힌 카드는 폭이 0 이다 — 나누면 Infinity·NaN 이 번호가 된다 */
    if (!clientWidth) return null;

    const k = Math.round(scrollLeft / clientWidth);
    /* 🔴 없는 장을 가리키지 않는다 (고무줄 스크롤 · 규칙 ④) */
    if (k < 0 || k >= count) return null;
    /* 🔴 격자에 안 붙었으면 «움직이는 중»이다 — 알리지 않는다 */
    if (Math.abs(scrollLeft - k * clientWidth) > tolerancePx) return null;
    /* 이미 그 장을 보고 있으면 알릴 것이 없다 */
    if (k === shownIdx) return null;
    return k;
}
