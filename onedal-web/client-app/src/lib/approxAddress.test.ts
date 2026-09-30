import { describe, expect, it } from 'vitest';
import { approxBadgeOf, approxShortOf } from './approxAddress';

/**
 * 📍 **주소 대략 알약** (기사님 «가» · onedal-1f) — 서버가 콜 주소를 못 찾아 읍·면·동 중심으로 판정했으면 판정석·상태바가 그렇게 말한다.
 * 어느 쪽(상차·하차)이 대략인지 적는다. 둘 다 정확하면 없다.
 */
describe('📍 주소 대략', () => {
    it('🔴 상차만 대략 → «📍 상차 주소 대략 — 마장면 중심»', () => {
        expect(approxBadgeOf({ pickupApprox: '마장면' })).toBe('📍 상차 주소 대략 — 마장면 중심');
    });
    it('🔴 하차만 대략', () => {
        expect(approxBadgeOf({ dropoffApprox: '운중동' })).toBe('📍 하차 주소 대략 — 운중동 중심');
    });
    it('🔴 둘 다 대략 → «📍 상차·하차 주소 대략»', () => {
        expect(approxBadgeOf({ pickupApprox: '마장면', dropoffApprox: '운중동' })).toBe('📍 상차·하차 주소 대략');
    });
    it('🔴 둘 다 정확하면 없다', () => {
        expect(approxBadgeOf({})).toBeNull();
        expect(approxShortOf({ pickupApprox: null, dropoffApprox: null })).toBeNull();
    });
    it('🔴 상태바 짧은 꼴 «📍 대략»', () => {
        expect(approxShortOf({ pickupApprox: '마장면' })).toBe('📍 대략');
    });
});
