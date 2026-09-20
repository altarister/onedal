/**
 * 🏔️ **들어가면 빈 차로 나오는 곳** — 노하우 148행 「못 빠져나온다」 줄
 * (`docs/자료/노하우/일하는_법/노하우_추출.md`).
 *
 * 🔴 **요금으로는 안 보인다.** 그쪽 콜은 오히려 비싸다 — 아무도 안 가려 하니까.
 *    「돈」 기준은 그 콜 하나만 보므로 🔵 를 낸다. 하루가 거기서 끝나는 것은 못 센다.
 *
 * 🔴 **버리는 것이 아니다** (규칙 ①) — 「지리」 배수를 깎아 색으로만 말한다.
 *    얼마나 깎을지는 판정 기준 탭의 «갇힘 지역 배수» 가 정한다.
 *
 * ⚠️ 목록을 늘리려면 **노하우 문서를 먼저 고친다** — 여기가 원천이 아니다.
 */

/** 시군구 전체가 갇힘인 곳 — `nearestDong().region` 과 견준다 (부분 일치: «인천 강화군» ⊃ «강화군») */
export const TRAPPED_REGIONS: readonly string[] = [
    '강화군', '연천군', '양평군', '가평군', '춘천시',
];

/** 시 일부만 갇힘인 곳 — 시군구가 넓어 통째로 막으면 멀쩡한 콜까지 깎인다 */
export const TRAPPED_TOWNS: ReadonlyArray<{ region: string; town: string }> = [
    { region: '남양주시', town: '수동면' },
    { region: '포천시', town: '영북면' },      // 산정호수
];

/**
 * 하차지가 갇힘 지역인가 — 좌표에서 얻은 시군구·읍면동을 넣는다 (`nearestDong`).
 * 🔴 못 쟀으면(둘 다 없음) `false` 다 — 깎지 않는다 (규칙 ⑤-2).
 */
export function isTrappedRegion(region?: string | null, town?: string | null): boolean {
    if (!region) return false;
    if (TRAPPED_REGIONS.some(r => region.includes(r))) return true;
    return TRAPPED_TOWNS.some(t => region.includes(t.region) && (town ?? '').includes(t.town));
}
