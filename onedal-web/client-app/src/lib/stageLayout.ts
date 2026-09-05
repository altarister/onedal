/**
 * 🗺️ **무대의 셈 — 시트가 덮는 만큼 지도가 비켜 준다** (2026-09-05 신설)
 *
 * ── 왜 뽑았나 ──
 * 🔴 **지도가 시트를 직접 알고 있었다.** `PinnedRouteCanvas` 가 `StageSheet` 의
 *    `sheetOccludedPx`·`SheetSnap` 을 import 했다 — 목업 전수조사에서 나온
 *    **유일한 부품→부품 직접 참조**다 (기사님 지시 2026-09-05).
 *
 *    지도가 알아야 할 것은 «시트»가 아니라 «**아래가 몇 px 가려졌나**» 하나다.
 *    부품 이름이 남의 prop 에 박혀 있으면 **그 부품을 못 갈아치운다** —
 *    시트를 다른 것으로 바꾸는 날 지도가 함께 깨진다.
 *
 * 👉 값과 셈을 **여기 한 곳**에 두고, 시트와 지도가 **각자 여기를 본다.**
 *    서로는 안 본다 (규칙 ③ · 이벤트 규칙 E-C).
 */

/**
 * 🗺️ **무대가 가려질 수 있는 최대 비율** — 지도가 볼 자리를 남긴다.
 *
 * 🔴 시트가 무대를 다 덮으면 «보이는 자리»가 0 이 되어 지도가 무너진다.
 * 🔴 기사님 확정 2026-09-05: *"판정 시트나 시트 아래 나타날 때 시트는 「나」 위치로
 *    가기 때문에 **모두 보여야 한다**"* — 판정이 보이는 것만으로 모자라다.
 *    **후보 경로를 지도에서 보는 것이 판정의 재료**다.
 */
export const STAGE_MAX_OCCLUDE_RATIO = 0.58;

/** 화면에 적을 때 쓰는 같은 값 (`58%`) — 두 번 적지 않는다 */
export const STAGE_MAX_OCCLUDE_CSS = `${STAGE_MAX_OCCLUDE_RATIO * 100}%`;

/**
 * 🗺️ **아래가 실제로 얼마나 가려졌나** — 잰 값이 있으면 그것이 이긴다.
 *
 * 🔴 시트가 «내용만큼» 설 수 있게 되면서 **미리 셀 수 없어졌다.** 시트가 재서 알려 주는
 *    값(`onHeightChange`)을 넘긴다. 없으면 어림한다.
 * 🔴 **아무리 높아도 상한을 넘지 않는다** — 넘기면 지도가 볼 자리가 0 이 된다.
 */
export function occludedPx(stageHeight: number, measuredPx?: number, fallbackPx?: number): number {
    const raw = (measuredPx != null && measuredPx > 0) ? measuredPx : (fallbackPx ?? 0);
    return Math.min(raw, stageHeight * STAGE_MAX_OCCLUDE_RATIO);
}
