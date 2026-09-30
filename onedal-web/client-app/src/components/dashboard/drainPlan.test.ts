import { describe, expect, it } from 'vitest';
import { drainPlanOf } from './JudgmentSeat';

/**
 * ⏳ **판정석 배경 막대 — transform + transition 두 걸음** (기사님 «판정 영역의 애니메이션도 같이 작동해야 해» · onedal-1f).
 * 걸음 1: 지금 있어야 할 자리로(처음 그릴 때는 곧바로 · 끝이 바뀌면 0.3초에 부드럽게) · 걸음 2: 끝 시각까지 곧게 가득 찬다.
 * 지키는 것: 흐른 만큼에서 시작한다(새로고침·판정이 와도 처음부터 다시 차지 않음) · 끝이 당겨지면 뛰지 않고 이어진다 · 끝에 닿으면 가득 찬 채 머문다.
 */
const S = 1_000_000;
describe('⏳ 막대 걸음', () => {
    it('🔴 처음 그릴 때 — 흐른 만큼(30초 중 3초 = 0.1)에서 곧바로, 남은 27초 동안 가득', () => {
        const p = drainPlanOf(S, S + 30_000, S + 3_000, false);
        expect(p.first).toEqual({ scale: 0.1, transition: 'none', ms: 0 });
        expect(p.second).toEqual({ scale: 1, transition: 'transform 27s linear' });
    });
    it('🔴 끝이 당겨지면(30 → 13초) 0.3초에 새 자리로 옮긴 뒤 이어 간다 — 뛰지 않는다', () => {
        const p = drainPlanOf(S, S + 13_000, S + 3_000, true);
        expect(p.first.transition).toBe('transform 0.3s ease-out');
        expect(p.first.ms).toBe(300);
        expect(p.first.scale).toBeCloseTo(3.3 / 13, 3);         // 0.3초 뒤에 있어야 할 자리
        expect(p.second).toEqual({ scale: 1, transition: 'transform 9.7s linear' });
    });
    it('🔴 끝에 닿았거나 지났으면 가득 찬 채 머문다 — 다시 줄거나 깜빡이지 않는다', () => {
        const p = drainPlanOf(S, S + 10_000, S + 12_000, true);
        expect(p.first).toEqual({ scale: 1, transition: 'none', ms: 0 });
        expect(p.second).toEqual({ scale: 1, transition: 'none' });
    });
});
