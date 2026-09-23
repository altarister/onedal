import { describe, it, expect } from 'vitest';
import {
    excludedSggsOf, excludedDongsOf,
    toggleSggAll, toggleSggOne, toggleDongAll, toggleDongOne,
} from './excludePick';

/**
 * 🚫 빼는 곳 — 기사님이 말씀하신 그대로 (2026-09-23)
 *
 * *"도: 서울을 선택 하고 시군구: 서울을 선택 했다면 나머지는 선택된 상태로 보여야 한다.
 *   그리고 그중 강남구를 뺀다면 전체 선택 서울이 선택해제 되어야 한다."*
 */

const SEOUL = ['서울 강남구', '서울 강동구', '서울 종로구'];

describe('🚫 「전체」와 하나하나', () => {

    it('① 「전체」를 누르면 그 아래가 **전부** 켜져 보인다', () => {
        const d = toggleSggAll([], '서울', SEOUL);
        expect(excludedSggsOf(d, '서울', SEOUL)).toEqual(SEOUL);
        /* 저장은 「전체」 하나로 — 나중에 구가 새로 생겨도 빠지게 */
        expect(d).toEqual(['S|서울']);
    });

    it('② 그중 하나를 끄면 「전체」가 풀리고 나머지는 켜진 채 남는다', () => {
        const all = toggleSggAll([], '서울', SEOUL);
        const d = toggleSggOne(all, '서울', SEOUL, '서울 강남구');
        expect(excludedSggsOf(d, '서울', SEOUL)).toEqual(['서울 강동구', '서울 종로구']);
        expect(d).not.toContain('S|서울');
        expect(d.sort()).toEqual(['R|서울 강동구', 'R|서울 종로구']);
    });

    it('③ 하나씩 눌러 전부 켜지면 「전체」로 저절로 접힌다', () => {
        let d: string[] = [];
        for (const g of SEOUL) d = toggleSggOne(d, '서울', SEOUL, g);
        expect(d).toEqual(['S|서울']);
        expect(excludedSggsOf(d, '서울', SEOUL)).toEqual(SEOUL);
    });

    it('④ 「전체」를 다시 누르면 그 시·도가 통째로 되살아난다', () => {
        const all = toggleSggAll([], '서울', SEOUL);
        expect(toggleSggAll(all, '서울', SEOUL)).toEqual([]);
    });

    it('🔴 여러 시·도를 동시에 뺀다 — 서울을 만져도 경기 것은 그대로다', () => {
        const GG = ['파주시', '이천시'];
        let d = toggleSggOne([], '경기', GG, '파주시');
        d = toggleSggAll(d, '서울', SEOUL);
        expect(d).toContain('R|파주시');
        expect(d).toContain('S|서울');
        d = toggleSggOne(d, '서울', SEOUL, '서울 강남구');
        expect(d).toContain('R|파주시');   // 서울을 건드려도 경기는 안 흔들린다
    });
});

describe('🚫 읍·면·동 칸도 같은 규칙', () => {
    const DONGS = ['역삼동', '삼성동', '청담동'];

    it('위가 통째로 빠져 있으면 동도 전부 켜져 보인다', () => {
        const d = toggleSggOne([], '서울', SEOUL, '서울 강남구');
        expect(excludedDongsOf(d, '서울', '서울 강남구', DONGS)).toEqual(DONGS);
    });

    it('동 칸의 「전체」는 그 시·군·구를 통째로 뺀다', () => {
        const d = toggleDongAll([], '서울', SEOUL, '서울 강남구', DONGS);
        expect(d).toEqual(['R|서울 강남구']);
    });

    it('🔴 시·도가 「전체」로 접혀 있어도 동 하나를 되살릴 수 있다 — 먼저 펼친다', () => {
        const all = toggleSggAll([], '서울', SEOUL);
        const d = toggleDongOne(all, '서울', SEOUL, '서울 강남구', DONGS, '역삼동');
        /* 강남구는 역삼동만 살아나고, 나머지 구는 통째로 빠진 채다 */
        expect(excludedDongsOf(d, '서울', '서울 강남구', DONGS)).toEqual(['삼성동', '청담동']);
        expect(excludedSggsOf(d, '서울', SEOUL)).toEqual(['서울 강동구', '서울 종로구']);
    });

    it('동을 하나씩 눌러 전부 채우면 시·군·구 「전체」로 접힌다', () => {
        let d: string[] = [];
        for (const dong of DONGS) d = toggleDongOne(d, '서울', SEOUL, '서울 강남구', DONGS, dong);
        expect(d).toEqual(['R|서울 강남구']);
    });

    it('시·군·구를 통째로 빼면 그 안의 동 키는 남지 않는다', () => {
        let d = toggleDongOne([], '서울', SEOUL, '서울 강남구', DONGS, '역삼동');
        d = toggleSggOne(d, '서울', SEOUL, '서울 강남구');
        expect(d).toEqual(['R|서울 강남구']);
    });
});
