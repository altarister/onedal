import { describe, it, expect } from 'vitest';
import { sectionEndsOf, sectionLinesOf } from './sectionLine';

/**
 * 🎨 **구간별 선** — 선을 **두 벌로 안 보내려고** 경계만 싣고 여기서 자른다.
 * 🔴 같은 점열을 구간마다 복제해 보내면 폴리라인만으로 초당 수백 KB 가 오가 브라우저가 죽는다
 *    (종료 콜 폴리라인만으로 초당 474KB 실측) — 그래서 «자른다»가 규칙이다.
 */
describe('sectionEndsOf — 구간 경계를 만든다', () => {
    it('구간마다의 점 수를 누적한 끝 인덱스다', () => {
        expect(sectionEndsOf([[1, 2], [3], [4, 5, 6]])).toEqual([2, 3, 6]);
    });
    it('빈 구간도 자리를 지킨다 — 구간 수가 달라지면 색이 밀린다', () => {
        expect(sectionEndsOf([[1, 2], [], [3]])).toEqual([2, 2, 3]);
    });
    it('구간이 없으면 빈 배열', () => {
        expect(sectionEndsOf([])).toEqual([]);
    });
});

describe('sectionLinesOf — 통짜 선을 경계로 자른다', () => {
    const pts = [1, 2, 3, 4, 5, 6];
    it('🔴 이어 붙이면 원래 점열과 **똑같다** — 복제가 아니라 조각이다', () => {
        const cut = sectionLinesOf(pts, [2, 3, 6]);
        expect(cut).toEqual([[1, 2], [3], [4, 5, 6]]);
        expect(cut.flat()).toEqual(pts);
    });
    it('🔴 경계가 없으면 **한 구간**으로 돌려준다 — 그리는 쪽이 한 색으로 물러난다', () => {
        expect(sectionLinesOf(pts, undefined)).toEqual([pts]);
        expect(sectionLinesOf(pts, [])).toEqual([pts]);
    });
    it('🔴 마지막 끝이 점 수와 안 맞으면 안 믿는다 — 옛 경계가 남은 판이다', () => {
        expect(sectionLinesOf(pts, [2, 3])).toEqual([pts]);        // 6 이 아니다
        expect(sectionLinesOf(pts, [2, 3, 9])).toEqual([pts]);     // 점 수를 넘는다
    });
    it('🔴 경계가 뒤로 가면 안 믿는다 — 거꾸로 된 조각을 만들지 않는다', () => {
        expect(sectionLinesOf(pts, [4, 2, 6])).toEqual([pts]);
    });
    it('선이 없으면 빈 배열 — 지어내지 않는다', () => {
        expect(sectionLinesOf([], [0])).toEqual([]);
        expect(sectionLinesOf(undefined, [1])).toEqual([]);
    });
    it('왕복 — 만든 경계로 자르면 원래 구간이 그대로 나온다', () => {
        const lines = [[{ x: 1, y: 1 }], [{ x: 2, y: 2 }, { x: 3, y: 3 }]];
        expect(sectionLinesOf(lines.flat(), sectionEndsOf(lines))).toEqual(lines);
    });
});
