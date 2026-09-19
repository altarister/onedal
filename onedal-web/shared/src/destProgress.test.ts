import { describe, it, expect } from 'vitest';
import { destProgressRatio } from './callNet';

/**
 * 🧭 **전진율 — 이 콜로 움직이는 거리 중 얼마가 목적지 쪽으로 줄어드나**
 *
 * 무엇을 막나
 * - 분모를 «현위치 → 목적지»로 두는 것 — 목적지에 가까워지면 0 으로 수렴해 터지고,
 *   그 전에도 목적지 근처에서 어떤 콜이든 전진율이 낮게 나온다 (콜이 많은 곳일 수 있다)
 * - 제자리 콜에서 0 으로 나누는 것 — 못 쟀으면 `null` 이다 (규칙 ④)
 * - −1~1 을 벗어나는 것
 */
describe('🧭 전진율', () => {
    // 위도 1도 ≈ 111km. 남북으로만 움직여 손으로 검산할 수 있게 둔다
    const south = { lng: 127, lat: 37 };
    const north1 = { lng: 127, lat: 38 };
    const north2 = { lng: 127, lat: 39 };

    it('🔴 목적지 쪽으로 곧장 가면 +1 이다', () => {
        expect(destProgressRatio(south, north1, north2)).toBeCloseTo(1, 3);
    });

    it('🔴 목적지에서 곧장 멀어지면 −1 이다', () => {
        expect(destProgressRatio(north1, south, north2)).toBeCloseTo(-1, 3);
    });

    it('🔴 목적지를 지나쳐 더 가도 −1 을 밑돌지 않는다', () => {
        const r = destProgressRatio(south, north2, north1)!;
        expect(r).toBeGreaterThanOrEqual(-1);
        expect(r).toBeLessThan(1);
    });

    it('목적지와 수직으로 움직이면 0 에 가깝다', () => {
        const west = { lng: 126, lat: 37 };
        const east = { lng: 128, lat: 37 };
        expect(Math.abs(destProgressRatio(west, east, { lng: 127, lat: 47 })!)).toBeLessThan(0.1);
    });

    it('🔴 제자리 콜은 못 쟀다 — `null` (0 으로 나누지 않는다)', () => {
        expect(destProgressRatio(south, { ...south }, north1)).toBeNull();
    });

    it('🔴 목적지 바로 옆에서도 터지지 않는다 — 분모가 «이 콜이 움직이는 거리»라서', () => {
        const nearGoal = { lng: 127.0001, lat: 38.0001 };
        const r = destProgressRatio(nearGoal, south, north1)!;
        expect(Number.isFinite(r)).toBe(true);
        expect(r).toBeCloseTo(-1, 2);        // 목적지에서 멀어지는 콜이다
    });

    /**
     * 🔴 **옆으로 새는 콜은 음수다.** 목적지가 북쪽인데 동쪽으로 111km 가면 목적지까지가
     *    222km → 248km 로 **늘어난다**. «앞으로 가는 것 같지만 멀어지는» 콜을 잡는 자리다.
     */
    it('목적지가 북쪽인데 동쪽으로 가면 음수다 — 멀어지기 때문', () => {
        const east111 = { lng: 128.25, lat: 37 };
        expect(destProgressRatio(south, east111, north2)).toBeCloseTo(-0.23, 2);
    });
});
