# 💰 1DAL 다이내믹 요율 엔진 명세서 (Pricing Engine Spec)

> **문서 상태**: v2.0 (상세 확장판)  
> **목적**: 기사별 요율 설정(수수료, 할인율)을 바탕으로 동적으로 하한선을 도출하는 코드 수준 명세.

---

## 1. 요율 엔진 인터페이스 (`PricingEngine`)

콜센터 수수료와 합짐이라는 특수성 때문에 기사님들마다 **"이 가격 이하로는 안 간다"**는 하한선 마지노선이 존재합니다. `PricingEngine`은 상태를 가지지 않는(Stateless) 순수 함수(Pure Function)로 설계되어 입력값에 대한 예측 가능한 결과를 보장합니다.

```typescript
// src/core/engine/PricingEngine.ts

export interface PricingConfig {
    /** 차종별 1km 당 기본 운임 단가 (예: { "1t": 1000, "라보": 900 }) */
    vehicleRates: Record<string, number>;
    
    /** 주선소(콜센터)에 떼이는 수수료 퍼센트 (예: 23%) */
    agencyFeePercent: number;
    
    /** 합짐의 경우, 기사가 양보(할인)해 줄 수 있는 최대 퍼센트 (예: 10%) */
    maxDiscountPercent: number;
}

export interface PricingResult {
    /** 
     * 수수료를 공제하고 기사가 쥐게 되는 적정 순수익 
     * 공식: (거리 * 단가) * (1 - 수수료율)
     */
    fairPrice: number;
    
    /** 
     * 합짐을 위해 마진을 깎더라도 기사가 수용할 수 있는 절대 마지노선 
     * 공식: 적정 순수익 * (1 - 최대할인율)
     */
    minAcceptable: number;
    
    /** 
     * 실제 운임과 하한선을 비교한 판독 결과
     */
    verdict: 'HONEY' | 'FAIR' | 'UNDERPAID';
}
```

---

## 2. 요금 연산 코어 로직

```typescript
// src/core/engine/PricingEngine.ts

export class PricingEngine {
    
    /**
     * 동적 요금 하한선과 적정가를 계산합니다.
     * 
     * @param distanceKm 카카오 라우팅으로 연산된 오더의 실제 운행 거리 (km)
     * @param orderVehicleType 앱에서 파싱된 오더의 요구 차종 (예: '1t')
     * @param fallbackVehicleType 파싱 실패 시 적용할 기사님의 기본 차종 설정값
     * @param pricing 기사님의 DB 설정값 (PricingConfig)
     * @param actualFare 실제 오더에 찍힌 요금
     * @returns PricingResult (적지가, 하한가, 판독결과)
     */
    public static calculateDynamicFare(
        distanceKm: number,
        orderVehicleType: string | undefined,
        fallbackVehicleType: string,
        pricing: PricingConfig,
        actualFare: number
    ): PricingResult {
        
        // 1. 차종에 따른 단가(km당) 추출
        const vehicleKey = orderVehicleType && pricing.vehicleRates[orderVehicleType]
            ? orderVehicleType
            : fallbackVehicleType;
        const ratePerKm = pricing.vehicleRates[vehicleKey] || 1000;
        
        // 2. 수수료 및 할인 승수 도출
        const feeMultiplier = 1 - (pricing.agencyFeePercent / 100);
        const discountMultiplier = 1 - (pricing.maxDiscountPercent / 100);

        // 3. 적정 금액 계산 (수수료 제외한 기사 실수익)
        // 예: 10km * 1000원 * (1 - 0.23) = 7,700원
        const fairPrice = Math.round(distanceKm * ratePerKm * feeMultiplier);
        
        // 4. 수용 하한선 도출 (합짐 할인 반영)
        // 예: 7,700원 * (1 - 0.10) = 6,930원
        const minAcceptable = Math.round(fairPrice * discountMultiplier);

        // 5. 실제 운임과 비교하여 라벨링
        let verdict: 'HONEY' | 'FAIR' | 'UNDERPAID' = 'FAIR';
        
        if (actualFare < minAcceptable) {
            verdict = 'UNDERPAID'; // 똥콜 (하한가 미달)
        } else if (actualFare >= fairPrice) {
            verdict = 'HONEY';     // 꿀콜 (마진 깎지 않아도 됨)
        }

        return { fairPrice, minAcceptable, verdict };
    }
}
```

---

## 3. 요금 연산 사용 예시 및 플러그인 위임

`OrderEvaluator` 내부에서 엔진을 돌리고, 앱 종속적인 예외 처리는 `IAppPlugin`에 위임합니다.

```typescript
const actualFare = 6000; // 오더 운임 6천원 (너무 쌈)

// 엔진 계산
const result = PricingEngine.calculateDynamicFare(
    10.5, "다마스", "1t", pricingConfig, actualFare
);
// result.fairPrice = 7,700원
// result.minAcceptable = 6,930원
// result.verdict = 'UNDERPAID'

// 플러그인에 예외 처리 위임 (화물24 등)
const adjusted = this.plugin.applyPricingExceptions(
    actualFare, result.fairPrice, result.minAcceptable
);

if (actualFare < adjusted.adjustedMinAcceptable) {
    const diff = adjusted.adjustedMinAcceptable - actualFare;
    order.reasons.push(`요율 미달 (적정: ${adjusted.adjustedFairPrice}, 하한: ${adjusted.adjustedMinAcceptable}, 실제: ${actualFare}, 차액: ${diff})`);
}
```
