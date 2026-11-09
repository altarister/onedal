// @ts-nocheck
import { describe, test, expect } from '@jest/globals';
import { PricingEngine } from '../../../src/core/engine/PricingEngine';

const loadOf = (vehicleText: string | null) => ({ vehicleText, sizeText: null, itemText: null, lines: [] });

describe('PricingEngine', () => {
    const mockConfig = {
        vehicleRates: { "1t": 1000 },
        agencyFeePercent: 23,
        maxDiscountPercent: 10
    };

    test('10km 단독 주행 시 적정가와 하한가가 올바르게 산출되는가', () => {
        // 10km * 1000원 = 10,000원
        // 수수료 23% 공제 -> 7,700원 (적정가)
        // 할인율 10% 공제 -> 6,930원 (하한선)
        const result = PricingEngine.calculateDynamicFare(10, loadOf("1t"), "insung", "1t", mockConfig, 8000);
        
        expect(result.fairPrice).toBe(7700);
        expect(result.minAcceptable).toBe(6930);
        expect(result.verdict).toBe('HONEY'); // 8000 >= 7700 이므로 꿀콜 판정
    });

    test('실제 요금이 하한선에 미달할 경우 똥콜로 판별되는가', () => {
        const result = PricingEngine.calculateDynamicFare(10, loadOf("1t"), "insung", "1t", mockConfig, 6500);
        expect(result.verdict).toBe('UNDERPAID'); // 6500 < 6930
    });

    test('실제 요금이 하한가와 적정가 사이일 경우 FAIR 판정', () => {
        const result = PricingEngine.calculateDynamicFare(10, loadOf("1t"), "insung", "1t", mockConfig, 7000);
        expect(result.verdict).toBe('FAIR'); // 6930 <= 7000 < 7700
    });

    /** 🚚 콜 짐 묶음 차종을 차종 맞춤 한 규칙(vehicleMatchOf)으로 — 톤 글자는 그 차종 · 우리 차종이 아니면 기사님 차종 단가(사유 글에만) */
    test.each([
        ['화물24시 «2.5톤/카고» 는 2.5t 단가', '2.5톤/카고', 'hwamul24', 9240],
        ['인성 «다» 는 다마스 단가', '다', 'insung', 6160],
        ['플렉스 «오토» 는 오토바이 단가', '오토', 'isflex', 5390],
        ['인성 «14t» 는 우리 차종에 없음 — 기사님 차종 1t 단가', '14t', 'insung', 7700],
        ['플렉스 차종 빈 칸은 모름 — 기사님 차종 1t 단가', null, 'isflex', 7700],
    ])('%s', (_, text, network, fair) => {
        const cfg = { vehicleRates: { "오토바이": 700, "다마스": 800, "1t": 1000, "2.5t": 1200 }, agencyFeePercent: 23, maxDiscountPercent: 10 };
        expect(PricingEngine.calculateDynamicFare(10, loadOf(text), network, "1t", cfg).fairPrice).toBe(fair);
    });
});
