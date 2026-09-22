import { describe, it, expect } from 'vitest';
import { homeLegNeeded } from './homeLeg';

/**
 * 🏠 **모의 주행 — 마지막 하차 뒤 집으로 떠나는 구간** (시험 도구).
 *
 * 경로 끝(마지막 하차지)에서 멈추면 하차 완료가 영영 안 찍힌다 — 하차 완료는 «정거장에서 멀어짐»
 * (지나침 이탈 400m · 떠남 2km)으로 찍히기 때문이다. `homeLegNeeded` 는 그 뒤 집으로 떠나는 구간을 달릴지만 판단한다.
 *
 * 🔴 **지금은 아무도 부르지 않는다** — 모의 주행은 경로 끝에서 그 자리 대기한다(`useMockGpsSimulator`).
 *    기사님이 누르지 않은 복귀 방향으로 차를 보내지 않기 위해서다. 이 검사는 판단 함수의 뜻만 지킨다.
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
