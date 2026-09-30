import { describe, expect, it } from 'vitest';
import { drainStyleOf } from './JudgmentSeat';

/**
 * ⏳ **판정석 배경 막대는 줄임 꼴 animation 하나로** (관제웹 콘솔 «style property during rerender» · onedal-1f «가»).
 * `animation` 과 `animationDelay` 를 한 요소에 같이 주면, 판정이 와서 길이가 바뀔 때 줄임 꼴을 다시 쓰며 지연이 0 으로 풀린다
 * — «흐른 만큼 미리 차 있게»가 깨져 막대가 처음부터 다시 줄어든다.
 */
describe('⏳ 배경 막대 스타일', () => {
    it('🔴 animation 하나만 · 음수 지연이 그 안에', () => {
        const s = drainStyleOf(30, 12.34);
        expect(Object.keys(s)).toEqual(['animation']);
        expect(s.animation).toContain('-12.3s');
        expect(s.animation).toContain('30s');
    });
    it('🔴 길이가 바뀌어도(30→45) 지연이 같이 실린다', () => {
        const before = drainStyleOf(30, 12.34), after = drainStyleOf(45, 12.34);
        expect(after.animation).toContain('45s');
        expect(after.animation).toContain('-12.3s');
        expect(after).not.toHaveProperty('animationDelay');
        expect(before.animation).not.toBe(after.animation);
    });
});
