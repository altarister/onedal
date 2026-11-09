import { vehicleMatchOf } from "@onedal/shared";
import type { CallLoad, PricingConfig, TargetAppType } from "@onedal/shared";

export class PricingEngine {
    /**
     * 다이내믹 요율 계산 엔진 (DB 의존성 없는 상태 비저장 순수 함수)
     * 
     * 적정 금액 = 거리(km) × 차종 단가 × (1 - 수수료율)
     * 수용 하한선 = 적정 금액 × (1 - 최대할인율)
     *
     * 차종 단가는 콜 짐 묶음 차종 글자를 `vehicleMatchOf`(원달앱 `FareFloor.rateOf` 와 같은 차종 맞춤 한 규칙)로
     * 우리 차종에 맞춘 단가다. 수단 상관없음 · 우리 차종에 없음 · 모름이면 기사님 차종(`fallbackVehicleType`) 단가다.
     * 
     * @returns 적정 금액, 수용 하한선, 꿀콜/적정/미달 판정
     */
    public static calculateDynamicFare(
        distanceKm: number,
        load: CallLoad,
        network: TargetAppType,
        fallbackVehicleType: string,
        pricing: PricingConfig,
        actualFare?: number
    ): { fairPrice: number; minAcceptable: number; verdict: 'HONEY' | 'FAIR' | 'UNDERPAID' } {
        const match = vehicleMatchOf(load, network);
        const vehicleKey = match.kind === 'OURS' && pricing.vehicleRates[match.vehicle]
            ? match.vehicle
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
