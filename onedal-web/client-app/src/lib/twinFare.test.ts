import { describe, expect, it } from 'vitest';
import { twinFareNoteOf } from './twinFare';

/**
 * 💰 **쌍둥이 콜 추정 요금** (기사님 «가» · 09-30 저녁).
 * 원달앱은 같은 가게·같은 경로 콜 둘을 손으로 열고 최종 수익이 안 보이면 낮은 요금으로 판정 받고,
 * 콜의 tagsText 끝에 «요금 둘 중 낮은 값 · 7,238 / 6,160»을 붙인다. 판정석은 이것으로 «이 요금은 추정»을 보인다.
 */
describe('💰 쌍둥이 콜 추정 요금 꼬리', () => {
    it('🔴 꼬리가 있으면 두 값을 뽑는다', () => {
        expect(twinFareNoteOf('소형 차종모름 · 요금 둘 중 낮은 값 · 7,238 / 6,160')).toEqual({ fares: '7,238 / 6,160' });
    });
    it('🔴 꼬리가 없으면 null — 다른 태그만 있거나 비었을 때', () => {
        expect(twinFareNoteOf('급송 예약 17:00 · 소형')).toBeNull();
        expect(twinFareNoteOf('')).toBeNull();
        expect(twinFareNoteOf(null)).toBeNull();
        expect(twinFareNoteOf(undefined)).toBeNull();
    });
});
