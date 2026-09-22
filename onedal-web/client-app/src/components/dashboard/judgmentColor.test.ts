import { describe, it, expect } from 'vitest';
import { SOAK } from './JudgmentSeat';
import { verdictOf } from '../../lib/verdict';

/**
 * 🧪 **판정색 한 벌**
 *
 * 🔴 **색이 곧 기사님의 결정이다** (규칙 ⑤-3). 심사석이 어디에 놓이든 —
 *    필터 자리든 시트 맨 아래든 — **같은 콜은 같은 색**이어야 한다.
 *    자리마다 색이 달라지면 그게 이 시스템의 가장 큰 사고다.
 *
 * ⚠️ 한때 «한 줄 심사석»(`JudgmentBar`)이 있었다. 판정보드를 콜 영역으로 내리면서
 *    «시트가 내려가 있으면 안 보인다»를 두 단으로 풀려던 것인데, 기사님이 상태바를
 *    **늘 같은 한 줄**로 두기로 하시면서 쓰이지 않게 됐다 (삭제).
 *    색표를 한 벌로 두는 이 검사는 그대로 남는다 — 자리가 늘어날 때마다 필요하다.
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
