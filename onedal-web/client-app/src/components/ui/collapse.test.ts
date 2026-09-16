import { describe, it, expect } from 'vitest';
import { collapseShows, collapseMove } from './collapse';

/**
 * 🪗 **접었다 펴는 자리의 규칙을 잠근다** (`ui/collapse`).
 *
 * 무는 것:
 *   ① **닫힌 뒤에는 자식을 안 그린다** — 필터처럼 «닫히면 훅·구독이 안 돌게» 스스로
 *      `return null` 하는 부품을 감싸고 있다. 늘 그리도록 새면 **닫아 둔 동안에도 구독이 돈다.**
 *   ② **접히는 동안에는 그린다** — 안 그리면 닫는 순간 내용이 사라져 접히는 모습이 안 보인다.
 *   ③ **첫 그림에는 전환을 안 건다** — 처음부터 닫혀 있는데 «방금 접힌 것»처럼 움직이면 거짓말이다.
 *
 * 🔴 화면 동작(타이머가 실제로 도는가)은 여기서 못 잡는다 — 관제웹에는 화면을 그려 보는
 *    검사 환경이 없다. **어떤 상태일 때 그리기로 하는가** 하나를 잠근다.
 */
describe('🪗 접었다 펴는 자리 — 언제 그리고 언제 버리나', () => {
    it('열려 있으면 그린다', () => {
        expect(collapseShows(true, false)).toBe(true);
        expect(collapseShows(true, true)).toBe(true);
    });

    it('🔴 접히는 동안에는 그린다 — 안 그리면 접히는 모습이 안 보인다', () => {
        expect(collapseShows(false, true)).toBe(true);
    });

    it('🔴 닫힘이 끝나면 버린다 — 훅·구독이 도는 것을 막는다', () => {
        expect(collapseShows(false, false)).toBe(false);
    });
});

describe('🪗 첫 그림에는 전환을 안 건다', () => {
    it('🔴 처음 그릴 때는 움직이지 않는다 — 처음부터 닫힌 것과 방금 닫은 것은 다르다', () => {
        expect(collapseMove(true, 200)).toBe('none');
    });

    it('그 뒤로는 준 시간만큼 움직인다', () => {
        expect(collapseMove(false, 200)).toContain('200ms');
        expect(collapseMove(false, 120)).toContain('120ms');
    });
});
