import { PricingConfig } from "@onedal/shared";

export class PricingEngine {
    /**
     * 다이내믹 요율 계산 엔진 (DB 의존성 없는 상태 비저장 순수 함수)
     * 
     * 적정 금액 = 거리(km) × 차종 단가 × (1 - 수수료율)
     * 수용 하한선 = 적정 금액 × (1 - 최대할인율)
     * 
     * @returns 적정 금액, 수용 하한선, 꿀콜/적정/미달 판정
     */
    public static calculateDynamicFare(
        distanceKm: number,
        orderVehicleType: string | undefined,
        fallbackVehicleType: string,
        pricing: PricingConfig,
        actualFare?: number
    ): { fairPrice: number; minAcceptable: number; verdict: 'HONEY' | 'FAIR' | 'UNDERPAID' } {
        const vehicleKey = orderVehicleType && pricing.vehicleRates[orderVehicleType]
            ? orderVehicleType
            : fallbackVehicleType;
            
        const ratePerKm = pricing.vehicleRates[vehicleKey] || 1000;
        const feeMultiplier = 1 - (pricing.agencyFeePercent / 100);
        const discountMultiplier = 1 - (pricing.maxDiscountPercent / 100);

        const fairPrice = Math.round(distanceKm * ratePerKm * feeMultiplier);
        const minAcceptable = Math.round(fairPrice * discountMultiplier);

        let verdict: 'HONEY' | 'FAIR' | 'UNDERPAID' = 'FAIR';
        
        if (actualFare !== undefined) {
            if (actualFare < minAcceptable) {
                verdict = 'UNDERPAID';
            } else if (actualFare >= fairPrice) {
                verdict = 'HONEY';
            }
        }

        return { fairPrice, minAcceptable, verdict };
    }
}
