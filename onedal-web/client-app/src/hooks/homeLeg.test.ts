import { describe, it, expect } from 'vitest';
import { homeLegNeeded } from './homeLeg';

/**
 * 🏠 **모의 주행 — 마지막 하차 뒤 집으로 떠나는 구간** (버그 대장 #133 · 시험 도구).
 *
 * 2026-09-15 이천 왕복 세 번째 바퀴: 모의 주행이 C3 하차지(초월역)에 도착·정차한 뒤 경로 끝이라 거기서 멈췄다.
 * 하차 완료는 «정거장에서 멀어짐»(지나침 이탈 400m · 떠남 2km)으로 찍히는데 차가 안 떠나 영영 «상차 완료»에 머물렀다
 * → 복귀가 저절로 꺼지는 E1 을 확인할 수 없었다. 실제 기사님은 마지막 짐을 내리고 **집으로 간다.**
 */
const home = { x: 127.2944, y: 37.3767 };
const LAT_PER_KM = 1 / 110.574;

describe('집으로 떠나는 구간을 달릴까', () => {
    it('경로 끝이 집에서 떠남 거리보다 멀면 달린다', () => {
        expect(homeLegNeeded({ x: 127.3, y: 37.3734 }, home, 0.4, false)).toBe(true);
    });

    it('🔴 이미 한 번 달렸으면 다시 안 달린다 — 집에서 끝나면 멈춘다 (반복하지 않는다)', () => {
        expect(homeLegNeeded({ x: 127.3, y: 37.3734 }, home, 0.4, true)).toBe(false);
    });

    it('경로 끝이 이미 집 가까이(떠남 거리 안)면 안 달린다 — 떠날 수 없는 자리다', () => {
        expect(homeLegNeeded({ x: home.x, y: home.y + 0.2 * LAT_PER_KM }, home, 0.4, false)).toBe(false);
    });

    it('🔴 집이나 지금 자리를 모르면 안 달린다 — 지어내지 않는다', () => {
        expect(homeLegNeeded(null, home, 0.4, false)).toBe(false);
        expect(homeLegNeeded({ x: 127.3, y: 37.3734 }, null, 0.4, false)).toBe(false);
    });
});
