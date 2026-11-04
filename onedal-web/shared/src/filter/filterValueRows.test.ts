import { describe, it, expect } from 'vitest';
import { FILTER_FIELDS, filterValueRowsOf } from './phases';

/** 🎛️ 값 다섯을 화면 줄로 — 관제웹 «필터설정값» 과 운영센터 «기사가 정한 값» 이 같은 글자를 적는다 */
describe('filterValueRowsOf', () => {
    const now = { destinationCity: '이천시', pickupRadiusKm: 10, detourRadiusKm: 6, destinationRadiusKm: 15, callDiscountPct: 100 };
    it('줄은 FILTER_FIELDS 순서 · 이름표 그대로 · 단위를 붙인다', () => {
        const rows = filterValueRowsOf(now);
        expect(rows.map(r => r.label)).toEqual(FILTER_FIELDS.map(f => f.label));
        expect(rows.find(r => r.path === 'pickupRadiusKm')?.text).toBe('10km');
        expect(rows.every(r => !r.differs)).toBe(true);
    });
    it('평소값과 다른 줄만 그 자리에서 말한다 — «10km (평소 15km)»', () => {
        const rows = filterValueRowsOf(now, { ...now, pickupRadiusKm: 15 });
        const r = rows.find(x => x.path === 'pickupRadiusKm')!;
        expect(r.text).toBe('10km (평소 15km)');
        expect(r.differs).toBe(true);
        expect(rows.filter(x => x.differs)).toHaveLength(1);
    });
    it('값이 없으면 «—» · 평소값이 비면 다르다고 하지 않는다', () => {
        expect(filterValueRowsOf(null)[0].text).toBe('—');
        expect(filterValueRowsOf(now, { pickupRadiusKm: null }).every(r => !r.differs)).toBe(true);
    });
});
