/**
 * ⛽ **1km 달리는 데 드는 기름값 — 한 곳**.
 *
 * ```
 * km당 기름값 = 기름 단가(원/L) ÷ 연비(km/L)
 * ```
 *
 * 값의 원천은 **기사님 설정**(`user_settings` 의 `fuel_price` · `fuel_efficiency`)이다.
 * 여기서는 나눗셈만 한다 — 기본값을 두지 않는다. 설정이 비면 «모른다»로 답한다.
 *
 * 🔴 **읽는 곳이 둘이 된다** — 판정의 「돈」(순이익 시급)과 서버(사실을 실어 넘길 때).
 *    그래서 나눗셈을 두 곳에 두지 않고 여기 하나에 둔다 (규칙 ③).
 * 🔴 **모르면 `null`** — 0 으로 채우면 «기름이 안 든다»가 되어 먼 콜이 공짜로 보인다 (규칙 ④).
 *    부르는 쪽은 `null` 을 받으면 그 항목을 빼고 센다.
 */

/**
 * ⛽ 1km 당 기름값(원). 둘 중 하나라도 없거나 0 이하면 `null`.
 *
 * @param fuelPriceKrwPerLiter 기름 단가 — 원/L (기사님 설정)
 * @param fuelEfficiencyKmPerLiter 연비 — km/L (기사님 설정)
 */
export function fuelCostPerKm(
    fuelPriceKrwPerLiter: number | null | undefined,
    fuelEfficiencyKmPerLiter: number | null | undefined,
): number | null {
    const price = Number(fuelPriceKrwPerLiter);
    const kmPerLiter = Number(fuelEfficiencyKmPerLiter);
    if (!Number.isFinite(price) || !Number.isFinite(kmPerLiter)) return null;
    if (price <= 0 || kmPerLiter <= 0) return null;
    return price / kmPerLiter;
}

/**
 * ⛽ **이 거리를 달리는 기름값(원)** — 거리나 km당 값을 모르면 `null`.
 *    음수 거리(경로가 짧아지는 합짐)는 그대로 음수로 낸다 — 그만큼 기름을 **덜** 쓴 것이 사실이다.
 */
export function fuelCostOf(km: number | null | undefined, perKm: number | null): number | null {
    /* 🔴 `Number(null) === 0` 이라 먼저 막는다 — 안 막으면 «거리를 모른다»가 «0km»가 되어
          기름값이 0 원으로 나온다. 먼 콜이 공짜로 보이는 자리다 (규칙 ④ · shared CLAUDE.md) */
    if (perKm == null || km == null) return null;
    const d = Number(km);
    return Number.isFinite(d) ? Math.round(d * perKm) : null;
}
