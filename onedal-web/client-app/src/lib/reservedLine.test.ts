import { describe, expect, it } from 'vitest';
import { reservedLineOf } from './reservedLine';

/**
 * 📅 **서랍 «예약» 칸의 한 줄 — 먼발치에서 읽히게** (reviews/23 B-4 · onedal-1f 조건).
 * 순서는 날 · 상차 시각 · 상차→하차 · 요금 · 색. 모르는 칸은 지어내지 않고 «—»·«--:--» 로 둔다.
 */
describe('📅 예약 한 줄', () => {
    const base = { id: 'r1', pickup: '경기 광주시 초월읍', dropoff: '경기 이천시 관고동', fare: 30000 } as any;

    it('날 · 상차 시각 · 상차→하차 · 요금 · 색 그 순서', () => {
        const line = reservedLineOf({ ...base, reservedFor: '2026-10-01', reservedAt: '09:00', judgment: { color: '꿀', score: 80 } });
        expect(line.day).toBe('10/1');
        expect(line.at).toBe('09:00');
        expect(line.route).toContain('→');
        expect(line.fare).toBe('3.0만');
        expect(line.dot).toBe('🔵');
        expect(line.text).toBe(`10/1 · 09:00 · ${line.route} · 3.0만 · 🔵`);
    });

    it('🔴 모르는 것은 지어내지 않는다 — 시각 없음 «--:--» · 판정 없음 «—»', () => {
        const line = reservedLineOf({ ...base, reservedFor: '2026-10-01' });
        expect(line.at).toBe('--:--');
        expect(line.dot).toBe('—');
    });
});
