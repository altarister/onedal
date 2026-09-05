import { describe, it, expect } from 'vitest';
import {
    measureOffset, serverNow, isSynced, isDrifting,
    CLOCK_DRIFT_WARN_MS, type ClockSync,
} from './serverClock';

/**
 * 🕐 **서버 시계** (기사님 2026-09-05 — *"서버 시간으로 우리가 계산하지"*)
 *
 * 🔴 헤더 시계가 `new Date()`(폰 시계)인데 **서버 연결 점 옆**에 있어
 *    «서버가 말한 시각»으로 읽혔다. 판정은 서버 시각으로 재므로 둘이 갈라지면
 *    *"왜 벌써 끝났지"* 가 된다.
 */
describe('🕐 오프셋을 잰다', () => {
    it('왕복의 절반을 빼고 잰다 — 오는 길만큼은 서버가 이미 지나 있다', () => {
        // 우리가 1000 에 보냈고 1200 에 받았다(왕복 200). 서버는 5100 이라 했다.
        // 서버가 답한 순간 우리 시계는 1100 이었을 것 → 오프셋 4000
        const s = measureOffset(1000, 1200, 5100);
        expect(s.offsetMs).toBe(4000);
        expect(s.rttMs).toBe(200);
    });

    it('시계가 같으면 오프셋이 0 이다', () => {
        expect(measureOffset(1000, 1100, 1050).offsetMs).toBe(0);
    });

    it('🔴 왕복을 함께 남긴다 — 길면 그만큼 못 믿는다는 뜻이다', () => {
        expect(measureOffset(0, 4000, 2000).rttMs).toBe(4000);
    });

    it('시계가 거꾸로 가도 음수 왕복을 만들지 않는다', () => {
        expect(measureOffset(500, 400, 500).rttMs).toBe(0);
    });
});

describe('🕐 지금 서버 시각', () => {
    const sync = (offsetMs: number): ClockSync => ({ offsetMs, rttMs: 20, measuredAt: 0 });

    it('오프셋을 더한다', () => {
        expect(serverNow(sync(4000), 1000)).toBe(5000);
        expect(serverNow(sync(-2500), 10_000)).toBe(7500);
    });

    it('🔴 아직 못 쟀으면 **우리 시계 그대로다** — 지어내지 않는다', () => {
        expect(serverNow(null, 1234)).toBe(1234);
        expect(isSynced(null)).toBe(false);
    });
});

describe('⚠️ 폰 시계가 틀어졌다', () => {
    const sync = (offsetMs: number): ClockSync => ({ offsetMs, rttMs: 20, measuredAt: 0 });

    it('기준은 30초다 — 안전취소와 같은 크기', () => {
        expect(CLOCK_DRIFT_WARN_MS).toBe(30_000);
    });

    it('양쪽으로 다 본다 — 빠른 것도 느린 것도 틀어진 것이다', () => {
        expect(isDrifting(sync(31_000))).toBe(true);
        expect(isDrifting(sync(-31_000))).toBe(true);
        expect(isDrifting(sync(29_000))).toBe(false);
    });

    it('🔴 못 쟀을 때를 «틀어졌다»고 하지 않는다 — 모르는 것과 틀린 것은 다르다', () => {
        expect(isDrifting(null)).toBe(false);
    });
});
