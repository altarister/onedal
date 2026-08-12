import { describe, it, expect } from 'vitest';
import { resolveCity, type CityGroup } from './cityOptions';

/**
 * 🔴 2026-08-12 실제로 났던 사고를 고정한다.
 *
 * DB 에는 `파주` 가 있는데 필터 모달의 고정 목록에는 `파주시` 만 있었다.
 * `<select>` 는 값이 안 맞으면 **첫 항목**을 그린다 — 화면은 `용인시` 였고
 * 기사님은 필터가 용인인 줄 알고 계셨다. 서버는 `includes` 검색이라 파주로 잘 돌았다.
 */
const GROUPS: CityGroup[] = [
    { sido: '서울', cities: ['서울'] },
    { sido: '인천', cities: ['인천'] },
    { sido: '경기', cities: ['안산시', '안성시', '안양시', '용인시', '파주시'] },
];

describe('resolveCity', () => {
    it('옛 저장값 `파주` 를 `파주시` 로 끌어올린다 (DB 를 안 건드리기 위해)', () => {
        expect(resolveCity('파주', GROUPS)).toBe('파주시');
    });

    it('정식 이름은 그대로 둔다', () => {
        expect(resolveCity('용인시', GROUPS)).toBe('용인시');
        expect(resolveCity('서울', GROUPS)).toBe('서울');
    });

    it('둘 이상 걸리면 고르지 않는다 — 엉뚱한 도시를 보여주느니 "목록에 없음"이 낫다', () => {
        expect(resolveCity('안', GROUPS)).toBeNull();
    });

    it('없는 지역은 null (수도권 밖은 아직 지도 데이터가 없다)', () => {
        expect(resolveCity('대전광역시', GROUPS)).toBeNull();
        expect(resolveCity('', GROUPS)).toBeNull();
    });

    it('목록을 아직 못 받았으면 아무것도 바꾸지 않는다', () => {
        expect(resolveCity('파주', [])).toBeNull();
    });
});
