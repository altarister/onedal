// @ts-nocheck
import { describe, test, expect } from '@jest/globals';
import { PricingEngine } from '../../../src/core/engine/PricingEngine';

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
        const result = PricingEngine.calculateDynamicFare(10, "1t", "1t", mockConfig, 8000);
        
        expect(result.fairPrice).toBe(7700);
        expect(result.minAcceptable).toBe(6930);
        expect(result.verdict).toBe('HONEY'); // 8000 >= 7700 이므로 꿀콜 판정
    });

    test('실제 요금이 하한선에 미달할 경우 똥콜로 판별되는가', () => {
        const result = PricingEngine.calculateDynamicFare(10, "1t", "1t", mockConfig, 6500);
        expect(result.verdict).toBe('UNDERPAID'); // 6500 < 6930
    });

    test('실제 요금이 하한가와 적정가 사이일 경우 FAIR 판정', () => {
        const result = PricingEngine.calculateDynamicFare(10, "1t", "1t", mockConfig, 7000);
        expect(result.verdict).toBe('FAIR'); // 6930 <= 7000 < 7700
    });
});
