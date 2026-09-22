import { describe, it, expect } from 'vitest';
import { withAlpha } from './themes';

/**
 * 🎨 **색에 투명도를 붙인다 — 형식이 무엇이든**.
 *
 * 🔴 `rgb()` 만 처리하면 `hsl()` 색(콜 색)은 **그대로 불투명하게** 돌아온다.
 *    그러면 지도에서 콜 띠를 겹쳐 그려도 마지막 색 하나만 보여 «함께 가는 구간»이 사라진다.
 */
describe('withAlpha — 형식이 달라도 투명도가 먹는다', () => {
    it('rgb 는 rgba 가 된다', () => {
        expect(withAlpha('rgb(2, 132, 199)', 0.5)).toBe('rgba(2, 132, 199, 0.5)');
    });

    it('🔴 hsl 은 hsla 가 된다 — 콜 색이 이 형식이다', () => {
        expect(withAlpha('hsl(210 70% 55%)', 0.55)).toBe('hsla(210 70% 55% / 0.55)');
    });

    it('🔴 여섯 자리 hex 도 투명도가 붙는다', () => {
        expect(withAlpha('#35c3a9', 0.4)).toBe('rgba(53, 195, 169, 0.4)');
    });

    it('이미 투명도가 있는 색은 그대로 둔다 — 두 번 씌우지 않는다', () => {
        expect(withAlpha('rgba(2, 132, 199, 0.3)', 0.5)).toBe('rgba(2, 132, 199, 0.3)');
    });
});
