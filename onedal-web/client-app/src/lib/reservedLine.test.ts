import { describe, expect, it } from 'vitest';
import { callFromAppReport } from '@onedal/shared';
import { reservedLineOf, reservedDayLabel, reservedBadgeOf, reservedShortOf } from './reservedLine';

/** 첫 상차 약속 날 · 시각만 있는 콜 — 서버가 보내는 정거장 모양 */
const promised = (requestedDay: number | null | undefined, requestedTime?: string | null) => ({ pickupDetails: [{ requestedDay, requestedTime }] });

/**
 * 📅 **서랍 «예약» 칸의 한 줄 — 먼발치에서 읽히게** (onedal-1f 조건).
 * 순서는 날 · 상차 시각 · 상차→하차 · 요금 · 색. 모르는 칸은 지어내지 않고 «—»·«--:--» 로 둔다.
 */
describe('📅 예약 한 줄', () => {
    const base = callFromAppReport({ id: 'r1', pickup: '경기 광주시 초월읍', dropoff: '경기 이천시 관고동', fare: 30000 } as any) as any;
    const at = (time: string) => ({ pickupDetails: [{ ...base.pickupDetails[0], requestedTime: time }] });

    it('날 · 상차 시각 · 상차→하차 · 요금 · 색 그 순서', () => {
        const line = reservedLineOf({ ...base, ...at('09:00'), reservedFor: '2026-10-01', judgment: { color: '꿀', score: 80 } });
        expect(line.day).toBe('10/1(목)');
        expect(line.at).toBe('09:00');
        expect(line.route).toContain('→');
        expect(line.fare).toBe('3.0만');
        expect(line.dot).toBe('🔵');
        expect(line.text).toBe(`10/1(목) · 09:00 · ${line.route} · 3.0만 · 🔵`);
    });

    it('🔴 모르는 것은 지어내지 않는다 — 시각 없음 «--:--» · 판정 없음 «—»', () => {
        const line = reservedLineOf({ ...base, reservedFor: '2026-10-01' });
        expect(line.at).toBe('--:--');
        expect(line.dot).toBe('—');
    });
});

/**
 * 📅 **판정석의 예약 알약** (onedal-1f · 기사님 «가») — 손으로 연 예약 콜을 오늘 콜로 보고 수락하지 않게.
 * 날 글자는 서랍 줄과 한 벌(`reservedDayLabel`) · 요일은 보관 날 기준 · 오늘 콜에는 없다.
 */
describe('📅 판정석 예약 알약', () => {
    // 2026-09-30(수) 16:00 KST 에 잡은 콜
    const capturedAt = new Date(2026, 8, 30, 16, 0).toISOString();

    it('🔴 보관 날 글자 — 요일은 보관 날 기준', () => {
        expect(reservedDayLabel('2026-10-03')).toBe('10/3(토)');
        expect(reservedDayLabel(null)).toBe('—');
    });
    it('🔴 3일 뒤 · 11:00 → «📅 10/3(토) 11:00 예약»', () => {
        expect(reservedBadgeOf({ ...promised(3, '11:00'), capturedAt })).toBe('📅 10/3(토) 11:00 예약');
    });
    it('🔴 시각을 모르면 «시각 모름»', () => {
        expect(reservedBadgeOf({ ...promised(1, null), capturedAt })).toBe('📅 10/1(목) 시각 모름 예약');
    });
    it('🔴 오늘 콜(0 · 없음)에는 없다', () => {
        expect(reservedBadgeOf({ ...promised(0, '18:30'), capturedAt })).toBeNull();
        expect(reservedBadgeOf({ capturedAt })).toBeNull();
    });
    it('이미 보관 날이 적힌 콜은 그 날을 쓴다', () => {
        expect(reservedBadgeOf({ ...promised(undefined, '09:00'), reservedFor: '2026-10-06', capturedAt })).toBe('📅 10/6(화) 09:00 예약');
    });
});

/** 📅 **상태바 한 줄 심사석의 짧은 꼴** «10/3» (onedal-1f · 기사님 «붙여») — 날 글자는 같은 한 벌에서 */
describe('📅 상태바 짧은 예약 날', () => {
    const capturedAt = new Date(2026, 8, 30, 16, 0).toISOString();
    it('🔴 3일 뒤 → «10/3» (시각 · 요일 없음)', () => {
        expect(reservedShortOf({ ...promised(3, '11:00'), capturedAt })).toBe('10/3');
    });
    it('🔴 오늘 콜은 없다', () => {
        expect(reservedShortOf({ ...promised(0), capturedAt })).toBeNull();
        expect(reservedShortOf({ capturedAt })).toBeNull();
    });
});
