import { describe, it, expect } from 'vitest';
import { appFilterRowsOf } from './index';

/** 📦 앱 필터를 화면 줄로 — 두 현황판이 같은 순서 · 같은 줄임으로 그린다(사본이 둘이면 한쪽만 목록을 길게 찍는다) */
describe('appFilterRowsOf', () => {
    it('칸 순서는 APP_FILTER_KEYS 먼저 · 표에 없는 칸은 뒤', () => {
        const rows = appFilterRowsOf({ evaluatingNow: false, minFare: 30000, isActive: true });
        expect(rows.map(r => r[0])).toEqual(['isActive', 'minFare', 'evaluatingNow']);
    });
    it('목록은 «N개 · 앞 여섯 …» · 빈 목록은 그렇다고 · 맵은 «N개 키» · 낱값은 그대로', () => {
        const rows = Object.fromEntries(appFilterRowsOf({
            reservedPickupKeywords: ['가', '나', '다', '라', '마', '바', '사'], excludedKeywords: [], orderKm: { a: 1, b: 2 }, pickupRadiusKm: 6.2,
        }));
        expect(rows.reservedPickupKeywords).toBe('7개 · 가, 나, 다, 라, 마, 바 …');
        expect(rows.excludedKeywords).toBe('(빈 목록)');
        expect(rows.orderKm).toBe('2개 키');
        expect(rows.pickupRadiusKm).toBe(6.2);
    });
});
