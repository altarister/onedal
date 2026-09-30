import { describe, expect, it } from 'vitest';
import { drainStyleOf, previewDrainOf } from './JudgmentSeat';

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

/**
 * ⏩ **판정이 끝을 당기면(빨리 접기) 막대는 흐른 만큼에서 이어 줄고 judgeUntil 에 0** (onedal-1f 가)).
 * 흐른 초를 처음 그릴 때 한 번만 재면, 끝이 당겨질 때 옛 흐른 초로 다시 시작해 0 이 judgeUntil 과 어긋난다.
 */
describe('⏩ 미리보기 막대 길이', () => {
    const cap = Date.parse('2026-09-30T13:00:00Z');
    it('🔴 30초 막대 3초 흐름 → 판정이 끝을 13초로 당기면 13초 중 3초', () => {
        expect(previewDrainOf(cap + 30_000, cap, cap + 3_000, 30)).toEqual({ sec: 30, elapsed: 3 });
        expect(previewDrainOf(cap + 13_000, cap, cap + 3_000, 30)).toEqual({ sec: 13, elapsed: 3 });
    });
    it('끝을 모르면 기본 초 · 흐른 초는 0 아래로 안 간다', () => {
        expect(previewDrainOf(undefined, cap, cap + 3_000, 32)).toEqual({ sec: 32, elapsed: 3 });
        expect(previewDrainOf(cap + 10_000, cap, cap - 500, 30)).toEqual({ sec: 10, elapsed: 0 });
    });
});
