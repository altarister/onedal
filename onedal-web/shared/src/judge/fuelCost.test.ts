import { describe, it, expect } from 'vitest';
import { fuelCostPerKm, fuelCostOf } from './fuelCost';

/**
 * ⛽ **km당 기름값 — 기사님 설정에서 나온다**.
 *
 * 🔴 **모르면 `null`** — 0 으로 채우면 «기름이 안 든다»가 되어 먼 콜이 공짜로 보인다 (규칙 ④).
 * 🔴 **기본값을 두지 않는다** — 값의 원천은 기사님 설정 한 곳이다.
 */

describe('fuelCostPerKm — 기름 단가 ÷ 연비', () => {

    it('기사님 설정값으로 계산한다 (1,600원/L ÷ 10km/L = 160원/km)', () => {
        expect(fuelCostPerKm(1600, 10)).toBe(160);
    });

    it('연비가 좋으면 km당 값이 내려간다', () => {
        expect(fuelCostPerKm(1600, 16)).toBe(100);
    });

    it('🔴 기름 단가를 모르면 null — 0 으로 채우지 않는다', () => {
        expect(fuelCostPerKm(null, 10)).toBeNull();
        expect(fuelCostPerKm(undefined, 10)).toBeNull();
    });

    it('🔴 연비를 모르면 null', () => {
        expect(fuelCostPerKm(1600, null)).toBeNull();
    });

    it('🔴 연비가 0 이면 null — 나누면 무한대가 된다', () => {
        expect(fuelCostPerKm(1600, 0)).toBeNull();
    });

    it('🔴 음수는 값이 아니라 고장이다', () => {
        expect(fuelCostPerKm(-1600, 10)).toBeNull();
        expect(fuelCostPerKm(1600, -10)).toBeNull();
    });

    it('숫자가 아닌 것이 오면 null', () => {
        expect(fuelCostPerKm('' as unknown as number, 10)).toBeNull();
        expect(fuelCostPerKm(NaN, 10)).toBeNull();
    });
});

describe('fuelCostOf — 이 거리를 달리는 기름값', () => {

    it('오늘 설정(160원/km)으로 74km 를 달리면 11,840원', () => {
        expect(fuelCostOf(74, fuelCostPerKm(1600, 10))).toBe(11840);
    });

    it('🔴 km당 값을 모르면 null — 거리를 알아도 못 잰다', () => {
        expect(fuelCostOf(74, null)).toBeNull();
    });

    it('🔴 거리를 모르면 null', () => {
        expect(fuelCostOf(null, 160)).toBeNull();
        expect(fuelCostOf(undefined, 160)).toBeNull();
    });

    /** 🔴 합짐은 경로가 짧아질 수도 있다 — 그때는 기름을 덜 쓴 것이 사실이다 */
    it('거리가 음수면 기름값도 음수 — 덜 쓴 것을 0 으로 깎지 않는다', () => {
        expect(fuelCostOf(-5, 160)).toBe(-800);
    });

    it('거리가 0 이면 0 — «모른다»가 아니다', () => {
        expect(fuelCostOf(0, 160)).toBe(0);
    });
});
