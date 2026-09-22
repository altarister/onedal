import { describe, it, expect } from 'vitest';
import { bandStrokeOf, BAND_SPREAD_PX } from './bandStroke';

/**
 * 🌈 **콜이 늘어도 나란한 선이 읽혀야 한다** (기사님 지시 — 콜은 다섯까지 는다).
 *
 * 콜 수만큼 선이 늘어나므로, 두께와 간격을 콜 수에 맞춰 줄인다.
 * 🔴 전체 폭(맨 왼쪽 선 ~ 맨 오른쪽 선)이 한도를 넘으면 경로가 **굵은 띠 하나**로 뭉쳐 보인다.
 * 🔴 두께가 너무 얇아지면 먼발치에서 안 보인다 — 바닥을 둔다.
 */
describe('bandStrokeOf — 콜 수에 따라 두께와 자리', () => {
    it('콜이 하나면 밀지 않는다', () => {
        expect(bandStrokeOf(1, 0).shiftPx).toBe(0);
    });

    it('콜이 둘이면 가운데를 기준으로 반씩 나뉜다', () => {
        const a = bandStrokeOf(2, 0), b = bandStrokeOf(2, 1);
        expect(a.shiftPx).toBeCloseTo(-b.shiftPx);
        expect(a.widthScale).toBe(b.widthScale);
    });

    it('🔴 콜이 다섯이어도 전체 폭이 한도를 안 넘는다', () => {
        const first = bandStrokeOf(5, 0).shiftPx, last = bandStrokeOf(5, 4).shiftPx;
        expect(last - first).toBeLessThanOrEqual(BAND_SPREAD_PX + 0.001);
    });

    it('🔴 콜이 늘수록 얇아지지만 바닥 아래로는 안 간다', () => {
        expect(bandStrokeOf(5, 0).widthScale).toBeLessThan(bandStrokeOf(2, 0).widthScale);
        expect(bandStrokeOf(9, 0).widthScale).toBeGreaterThanOrEqual(0.5);
    });
});
