import { describe, it, expect } from 'vitest';
import { offsetScreenPath } from './parallelPath';

/**
 * 🌈 **콜 띠를 나란히 긋는다** — 같은 길을 두 콜이 함께 갈 때 색을 겹쳐 덮지 않으려고,
 *    각 콜의 선을 진행 방향의 **직각으로 몇 픽셀** 밀어 그린다.
 *
 * 🔴 투명도로 겹치면 선이 흐려져 운전 중에 안 읽힌다 (기사님) — 그래서 진한 선을 나란히 둔다.
 * ⚠️ 미는 양은 화면 픽셀이다. 확대해도 선 사이 간격이 일정해야 «두 줄»로 읽힌다.
 */
describe('offsetScreenPath — 진행 방향의 직각으로 민다', () => {
    it('오른쪽으로 가는 선을 밀면 위아래로 움직인다', () => {
        const out = offsetScreenPath([{ cx: 0, cy: 0 }, { cx: 10, cy: 0 }], 2);
        expect(out[0].cy).toBeCloseTo(2);      // 화면 좌표는 아래가 +
        expect(out[1].cy).toBeCloseTo(2);
        expect(out[0].cx).toBeCloseTo(0);
    });

    it('0 픽셀이면 그대로다', () => {
        const pts = [{ cx: 3, cy: 4 }, { cx: 9, cy: 4 }];
        expect(offsetScreenPath(pts, 0)).toEqual(pts);
    });

    it('점이 하나뿐이면 그대로 — 밀 방향이 없다', () => {
        expect(offsetScreenPath([{ cx: 1, cy: 2 }], 3)).toEqual([{ cx: 1, cy: 2 }]);
    });

    it('같은 점이 이어져도 터지지 않는다 — 길이 0 은 밀지 않는다', () => {
        const out = offsetScreenPath([{ cx: 5, cy: 5 }, { cx: 5, cy: 5 }], 2);
        expect(Number.isFinite(out[0].cx) && Number.isFinite(out[0].cy)).toBe(true);
    });
});
