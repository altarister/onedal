import { describe, it, expect } from 'vitest';
import { cityOfDropoff } from './regionMatch';

/** 🏙️ 하차의 행정 시 — 시 이름 · 동 이름만으로(좌표 아님 · 38 F41) */
describe('🏙️ cityOfDropoff', () => {
    const dongSigungu = { 중리동: ['이천시'], 신둔면: ['이천시'] };
    it('🔴 시 이름(전체 · 토막) · 목적지 동 표로 그 시 · 목적지 밖이면 null', () => {
        expect(cityOfDropoff('경기 이천시 중리동 219-1', ['이천시'])).toBe('이천시');
        expect(cityOfDropoff('이천 중리동', ['이천시'])).toBe('이천시');
        expect(cityOfDropoff('신둔면 수광리', ['이천시'], dongSigungu)).toBe('이천시');
        expect(cityOfDropoff('경기 광주시 초월읍', ['이천시'], dongSigungu)).toBeNull();
        expect(cityOfDropoff('', ['이천시'])).toBeNull();
    });
});
