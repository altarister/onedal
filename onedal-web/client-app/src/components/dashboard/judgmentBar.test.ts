import { describe, it, expect } from 'vitest';
import { SOAK } from './JudgmentSeat';
import { verdictOf } from '../../lib/verdict';

/**
 * 🧪 **판정색은 자리마다 달라지지 않는다** (2026-09-05)
 *
 * 판정보드를 콜 영역으로 내리는 안(ⓑ)을 만들면서 «한 줄 심사석»이 새로 생겼다.
 * 🔴 **색이 곧 기사님의 결정이다** (규칙 ⑤-3). 심사석과 한 줄이 다른 색을 내면
 *    그게 이 시스템의 가장 큰 사고다 — 그래서 색표를 하나로 두고 여기서 잠근다.
 */
describe('🎨 색표는 한 벌이다', () => {
    it('네 색이 다 있다 — 꿀 · 보통 · 똥 · 사고', () => {
        expect(Object.keys(SOAK).sort()).toEqual(['똥', '보통', '사고', '꿀'].sort());
    });

    it('색마다 띠·글자·번짐이 다 있다 — 한 칸이라도 비면 자리마다 달라 보인다', () => {
        for (const [name, c] of Object.entries(SOAK)) {
            for (const k of ['tint', 'bar', 'text', 'glow', 'wm'] as const) {
                expect(c[k], `${name} 의 ${k}`).toBeTruthy();
            }
        }
    });

    /** 🔴 판정 전에는 색이 없다 — 색을 지어내지 않는다 (규칙 ④) */
    it('판정 전에는 색이 null 이라 두 자리 모두 무채색이 된다', () => {
        expect(verdictOf({}).color).toBeNull();
        expect(verdictOf({ judgment: undefined }).color).toBeNull();
    });

    it('판정이 오면 그 값이 그대로 색이 된다 — 문장을 뒤지지 않는다', () => {
        const v = verdictOf({ judgment: { color: '꿀', score: 91, axes: [], gates: [], tags: [] } });
        expect(v.color).toBe('꿀');
        expect(v.source).toBe('값');
        expect(SOAK[v.color!]).toBeTruthy();
    });
});
