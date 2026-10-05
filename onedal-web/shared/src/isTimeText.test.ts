import { describe, it, expect } from 'vitest';
import { isTimeText } from './timing';

/** 🕒 받은 시각 판별 한 곳(`isTimeText`) — 통화 결과 · 단계 보고 두 입구가 이 판별로 거른다 */
describe('isTimeText', () => {
    it('관제앱 · 운영센터가 보내는 ISO 시각은 통과', () => {
        expect(isTimeText('2026-10-06T01:29:21.000Z')).toBe(true);
        expect(isTimeText('2026-10-06T10:29:21+09:00')).toBe(true);
    });
    it('빈 글자 · 시각 아닌 글자 · 숫자 · null 은 거른다', () => {
        for (const v of ['', '시각아님', 'NaN', 1791225233359, null, undefined, {}]) expect(isTimeText(v)).toBe(false);
    });
});
