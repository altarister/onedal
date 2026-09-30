import { describe, expect, it } from 'vitest';
import { drainPlanOf } from './JudgmentSeat';

/**
 * ⏳ **판정석 배경 막대 — 지켜 온 약속 둘** (90e28646 «흐른 만큼 이어 줄기» · 빨리 접기 «judgeUntil 에 0 · 0 에 머묾»).
 * 막대는 이제 transform + transition 두 걸음(`drainPlanOf`)이다 — CSS 키프레임(animation · animationDelay)을 쓰지 않아
 * «style property during rerender» 섞임이 생길 자리가 없다.
 */
const cap = Date.parse('2026-09-30T13:00:00Z');
describe('⏳ 막대 약속', () => {
    it('🔴 길이가 바뀌어도(30 → 45초) 흐른 만큼에서 이어 간다 — 처음부터 다시 차지 않는다', () => {
        const before = drainPlanOf(cap, cap + 30_000, cap + 12_000, false);
        const after = drainPlanOf(cap, cap + 45_000, cap + 12_000, true);
        expect(before.first.scale).toBeCloseTo(0.4, 5);
        expect(after.first.scale).toBeGreaterThan(0.26);           // 12.3 ÷ 45 — 0 으로 돌아가지 않는다
        expect(JSON.stringify(after)).not.toMatch(/animation/);
    });
    it('🔴 빨리 접기 — 판정이 끝을 13초로 당기면 그 시각에 가득 찬다(judgeUntil 에 0)', () => {
        const p = drainPlanOf(cap, cap + 13_000, cap + 3_000, true);
        expect(p.second).toEqual({ scale: 1, transition: 'transform 9.7s linear' });
    });
    it('🔴 끝을 지나면 가득 찬 채 머문다', () => {
        expect(drainPlanOf(cap, cap + 13_000, cap + 14_000, true).second).toEqual({ scale: 1, transition: 'none' });
    });
});
