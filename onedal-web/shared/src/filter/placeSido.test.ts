import { describe, it, expect } from 'vitest';
import { sidoOfPlaceName } from './callNet';

/**
 * 🗺️ **지역 검증의 기대지역은 지도에서 읽는다 — 손으로 적은 목록을 두지 않는다**
 *
 * 카카오가 «광주 초월읍»에 광주광역시를 줄 수 있어 «기대한 시도와 다르면 버린다»는 방어가 있다.
 * 그 기대지역을 **쿼리 첫 낱말**로 추측하면 둘 다 틀린다 —
 * 첫 낱말이 시·군이면(「이천 신둔면」) 방어가 아예 안 돌고, 광역시와 겹치는 시면(「광주 초월읍」)
 * **정답을 버린다**. 지도는 「초월읍은 경기 광주시」를 안다.
 *
 * 무엇을 막나
 * - 시도 이름표를 손으로 적어 두는 것 (`cityAliases` 도 이름표 없이 지도의 이름에서 만든다)
 * - 이름이 여러 시도에 있는데 하나로 단정하는 것 — 그때는 답하지 않는다 (규칙 ④)
 * - ⚠️ 지도는 **수도권과 충청권**만 담는다. 모르는 이름에는 답하지 않으므로 방어가 그냥 안 걸릴 뿐이다
 */
describe('🗺️ 이름으로 시도 찾기', () => {

    it('🔴 초월읍은 경기다 — 「광주」가 앞에 붙어도', () => {
        expect(sidoOfPlaceName('광주 초월읍')).toBe('경기');
        expect(sidoOfPlaceName('경기 광주시 초월읍 경충대로 907')).toBe('경기');
    });

    it('🔴 첫 낱말이 시·군이어도 찾는다 — 그동안 방어가 아예 안 돌던 자리', () => {
        expect(sidoOfPlaceName('이천 신둔면')).toBe('경기');
    });

    it('서울 동도 찾는다', () => {
        expect(sidoOfPlaceName('서울 영등포구 도림동')).toBe('서울');
    });

    it('🔴 이름이 여러 시도에 있으면 답하지 않는다 — 단정하지 않는다', () => {
        // 「도림동」은 서울과 다른 시도에 함께 있다
        expect(sidoOfPlaceName('도림동')).toBeNull();
    });

    it('🔴 지도가 모르는 이름에는 답하지 않는다 — 방어가 안 걸릴 뿐이다', () => {
        expect(sidoOfPlaceName('모다아울렛 곤지암점')).toBeNull();
        expect(sidoOfPlaceName('')).toBeNull();
        expect(sidoOfPlaceName('부산 해운대구 우동')).toBeNull();
    });

    it('🔴 동 이름이 다른 낱말에 묻혀 있어도 찾는다 — 건물명이 뒤에 붙는다', () => {
        expect(sidoOfPlaceName('경기 이천시 신둔면 신둔농협하나로마트 예스파크점')).toBe('경기');
    });
});
