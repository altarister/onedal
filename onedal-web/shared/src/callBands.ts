/**
 * 🌈 **콜마다 «내 짐이 차에 있는 동안»의 구간 범위** — 지도가 콜 색 띠를 겹쳐 그리는 재료.
 *
 * 구간 i 는 «정거장 i 에 닿는 길»이다 (`sectionStops` 와 `sectionEnds` 가 같은 길이·순서).
 * 그러므로 한 콜의 띠는 **그 콜을 실으러 가는 구간부터 내리는 구간까지**다.
 *
 * 🔴 **함께 가는 구간은 겹쳐서 보여야 한다** — 구간 하나를 한 콜에만 칠하면
 *    «이 길은 A 만 간다»로 읽힌다. 실제로는 그동안 B 도 차에 실려 있다.
 * 🔴 **이미 다녀온 상차지는 정거장 목록에 없다** — 그때는 경로 처음부터가 그 콜의 띠다
 *    (이미 싣고 달리는 중이라 시작을 지어낼 필요가 없다).
 * ⚠️ 하차지가 목록에 없으면 띠를 만들지 않는다 — 그릴 끝이 없다 (규칙 ④ — 지어내지 않는다).
 */
export function callBandsOf(
    sectionStops: ReadonlyArray<{ orderId: string; stopType: 'pickup' | 'dropoff' }> | null | undefined,
): Map<string, { from: number; to: number }> {
    const bands = new Map<string, { from: number; to: number }>();
    if (!sectionStops?.length) return bands;

    const pickupAt = new Map<string, number>();
    sectionStops.forEach((st, i) => {
        if (st.stopType === 'pickup' && !pickupAt.has(st.orderId)) pickupAt.set(st.orderId, i);
    });

    sectionStops.forEach((st, i) => {
        if (st.stopType !== 'dropoff' || bands.has(st.orderId)) return;
        bands.set(st.orderId, { from: pickupAt.get(st.orderId) ?? 0, to: i });
    });
    return bands;
}

/**
 * 🩶 **어느 콜의 짐도 안 실린 구간** — 지도가 여기만 «구분되는 회색 점선»으로 긋는다.
 *
 * 콜 띠는 «실으러 가는 길부터 내릴 때까지»다. 그 사이에 안 드는 구간이 생긴다 —
 * 다 내리고 다음 상차지로 가는 길, 마지막 하차 뒤 집으로 가는 길이 그렇다.
 * 🔴 그 구간을 콜 색으로 그리면 «이 콜을 싣고 간다»로 읽힌다 — 빈 차로 가는 길이라 색을 달리한다.
 */
export function uncoveredSectionsOf(
    sectionStops: ReadonlyArray<{ orderId: string; stopType: 'pickup' | 'dropoff' }> | null | undefined,
    sectionCount: number,
): number[] {
    const covered = new Set<number>();
    for (const band of callBandsOf(sectionStops).values()) {
        for (let i = band.from; i <= band.to; i++) covered.add(i);
    }
    const out: number[] = [];
    for (let i = 0; i < sectionCount; i++) if (!covered.has(i)) out.push(i);
    return out;
}
