// @ts-nocheck
import { normalizeVehicleType, NETWORK_PAGES, VEHICLE_CAPACITY } from '@onedal/shared';
import { OrderEvaluator } from '../../src/core/engine/OrderEvaluator';

/**
 * 🚚 **배차망의 차종 낱말 → 우리 차종은 배차망 정의 표(vehicleWords)가 원천** (차종 3단계 · 기사님 «기준은 배차망 · 그쪽 정의를 플러그인으로 우리 기준에 맞춘다» · onedal-69 «가»).
 *    화물24시 목록 차종은 원문 그대로 온다(«1톤/전체» · «다마스/전체»). 서버는 첫 «/»·공백 앞 낱말을 표에서 찾아 우리 차종으로 맞춘다.
 *    BASE 는 표 이전의 «N톤» 규칙 몸통을 글자 그대로 옮긴 기준 답이다(대조용 · 바꾸지 않는다).
 */
const BASE = (v: string): string | null => {
    const ton = /^(\d+(?:\.\d+)?)\s*톤(?:[/\s].*)?$/.exec(v.trim());
    return ton && VEHICLE_CAPACITY[`${ton[1]}t`] !== undefined ? `${ton[1]}t` : null;
};
const TON_SAMPLES = ['1톤/전체', '1톤', '1톤 카', '1.4톤/카', '1.4 톤/윙', '2.5톤/윙', '3.5톤', '5톤/윙', '11톤/윙', '25톤/카', '1.5톤/카', '8톤'];

describe('🚚 차종 낱말 — 정의 표', () => {
    it('🔴 화물24시 작은 차 낱말을 읽는다(«다마스/전체» → 다마스 …)', () => {
        expect(normalizeVehicleType('다마스/전체')).toBe('다마스');
        expect(normalizeVehicleType('라보/전체')).toBe('라보');
        expect(normalizeVehicleType('오토바이/전체')).toBe('오토바이');
        expect(normalizeVehicleType('승용/전체')).toBe('승용차');
    });
    it.each(TON_SAMPLES)('톤 차종 %s — 기준 답과 같다', raw => {
        expect([raw, normalizeVehicleType(raw)]).toEqual([raw, BASE(raw)]);
    });
    it('🔴 같은 낱말이 배차망마다 다른 차종이면 빨강(null 도 한 값) · null 이 아닌 차종은 적재 표(VEHICLE_CAPACITY)의 키', () => {
        /* null = «배차망 낱말은 알지만 우리 차종이 없다» — 한 배차망이 null, 다른 배차망이 차종이면 같은 낱말 두 뜻이라 빨강 */
        const seen = new Map<string, string | null>();
        for (const [net, spec] of Object.entries(NETWORK_PAGES)) for (const w of spec.vehicleWords ?? []) {
            expect([net, w.word, w.vehicle == null || w.vehicle in VEHICLE_CAPACITY]).toEqual([net, w.word, true]);
            if (seen.has(w.word)) expect([w.word, w.vehicle ?? null]).toEqual([w.word, seen.get(w.word)]);
            seen.set(w.word, w.vehicle ?? null);
        }
        expect(seen.size).toBeGreaterThan(0);
    });
    it('🔴 판정 차종 문 — «다마스/전체» 콜이 허용 차종 다마스와 맞는다', () => {
        const reasons: string[] = [], pros: string[] = [];
        new OrderEvaluator('hwamul24').runStage1ShapeFilter({ id: 'vw', vehicleType: '다마스/전체', fare: 30000, rawText: '' },
            { allowedVehicleTypes: ['다마스', '라보'], excludedKeywords: [] }, reasons, pros);
        expect(reasons.filter(r => r.includes('차종'))).toEqual([]);
        expect(pros).toContain('차종(다마스/전체) 일치');
    });
});
