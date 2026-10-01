// @ts-nocheck
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { OrderEvaluator } from '../../src/core/engine/OrderEvaluator';
import { SettingsRepository } from '../../src/repositories/SettingsRepository';

jest.mock('../../src/repositories/SettingsRepository');

/**
 * 💰 **배차망이 달라도 같은 콜 · 같은 요금이면 적정가 · 하한가가 같다** (reviews/34 1단계 ① · 기사님 «가: 걷는다»).
 *    화물24시만 ×1.15 를 곱하던 것은 «수수료가 이미 빠진 금액이라 가정할 경우»라는 주석 하나가 근거였다 —
 *    원달앱에는 그런 배수가 없고, 화물24시 좋은 콜이 15% 더 비싸야 통과했다.
 */
const order = { id: 'o-price', kakaoSoloDistanceKm: 30, fare: 50000, vehicleType: '1t' };

beforeEach(() => {
    SettingsRepository.loadPricingConfig.mockReturnValue({ vehicleRates: { '1t': 1000 }, agencyFeePercent: 20, maxDiscountPercent: 10 });
    SettingsRepository.getKakaoRoutingOptions.mockReturnValue({ carType: 1, defaultPriority: 'RECOMMEND', vehicleType: '1t' });
});

describe('💰 배차망별 요금 기준', () => {
    it('🔴 인성 · 화물24시 · 픽커가 같은 콜에 같은 적정가 · 하한가', () => {
        const [insung, hwamul24, picker] = ['insung', 'hwamul24', 'kakaopicker'].map(app => (new OrderEvaluator(app) as any).loadPricing(order, 'u', 0));
        expect(insung).not.toBeNull();
        expect(hwamul24).toEqual(insung);
        expect(picker).toEqual(insung);
    });
    it('🔴 배차망별 요금 보정(applyPricingExceptions)이 서버 src 에 없다', () => {
        const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true })
            .flatMap(e => e.isDirectory() ? walk(join(dir, e.name)) : e.name.endsWith('.ts') ? [join(dir, e.name)] : []);
        const hits = walk(join(__dirname, '../../src')).filter(f => /applyPricingExceptions|AdjustedPricing/.test(readFileSync(f, 'utf8')));
        expect(hits).toEqual([]);
    });
});
