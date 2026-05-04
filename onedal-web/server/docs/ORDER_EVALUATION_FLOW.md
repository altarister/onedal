# 🧠 1DAL 콜 심사 파이프라인 (Order Evaluation Flow)

> **문서 상태**: v2.0 (상세 확장판)  
> **목적**: 1차 형상 필터 -> 지오코딩 -> 카카오 라우팅 -> 동적 요율 판정으로 이어지는 파이프라인의 내부 코드 구조 명세.

---

## 1. 파이프라인 엔진 인터페이스

리팩토링된 `OrderEvaluator`는 모든 의존성(플러그인, 라우터, 요금엔진)을 주입받아 **순차적으로 실행하되(Non-Short-Circuit), 에러가 나도 최대한 많은 장단점 라벨을 수집**하도록 설계됩니다.

```typescript
// src/core/engine/OrderEvaluator.ts

import { IAppPlugin } from '../plugins/IAppPlugin';
import { KakaoService } from '../../services/kakaoService';
import { PricingEngine } from './PricingEngine';

export class OrderEvaluator {
    constructor(
        private plugin: IAppPlugin,
        private kakaoService: KakaoService,
        private pricingEngine: PricingEngine
    ) {}

    /**
     * 앱에서 올라온 PendingOrder를 심사하여 장/단점(pros/reasons)을 주입합니다.
     */
    public async evaluate(order: PendingOrder, session: UserSession): Promise<void> {
        // 배열 초기화
        order.reasons = [];
        order.approvalReasons = [];

        // Stage 1. 형상 필터 (단순 문자열/숫자 비교)
        this.runStage1ShapeFilter(order, session);

        // Stage 1.5 지오코딩
        const geoSuccess = await this.runGeocoding(order);
        if (!geoSuccess) {
            order.reasons.push("지오코딩 실패(좌표 변환 불가)");
            order.isRejected = true;
            return; // 좌표가 없으면 카카오 연산을 할 수 없으므로 여기서만 유일하게 Early Return
        }

        // Stage 2. 카카오/OSRM 궤적 연산
        await this.runStage2Routing(order, session);

        // Stage 3. 다이내믹 요금 판정
        this.runStage3Pricing(order, session);

        // 최종 판결
        order.isRejected = order.reasons.length > 0;
        order.status = 'ORDER_AWAITING_DECISION'; // 승격 완료
    }
}
```

---

## 2. 각 Stage 별 상세 로직 스니펫

### Stage 1. 형상 필터 (Shape Filter)
```typescript
private runStage1ShapeFilter(order: PendingOrder, session: UserSession) {
    const filter = session.activeFilter;

    // 절대 하한가 검사
    if (filter.dispatchPhase === 'STANDBY' && order.fare < filter.minFare) {
        order.reasons.push(`첫짐 절대하한가 미달 (${filter.minFare}원)`);
    }

    // 블랙리스트 검사 (플러그인 커스텀 룰 혼합)
    const rawText = `${order.pickup} ${order.dropoff} ${order.detailMemo}`;
    for (const kw of filter.excludedKeywords) {
        if (rawText.includes(kw)) order.reasons.push(`제외키워드(${kw}) 감지`);
    }
    const customReasons = this.plugin.evaluateCustomRules(rawText);
    order.reasons.push(...customReasons);
    
    // 회랑 이탈 여부 검사 (합짐일 경우)
    if (filter.isSharedMode && filter.destinationKeywords.length > 0) {
        const isCorridorMatched = filter.destinationKeywords.some(kw => order.dropoff.includes(kw));
        if (!isCorridorMatched) order.reasons.push(`도착지 회랑 이탈`);
    }
}
```

### Stage 2. 궤적 연산 (Routing)
```typescript
private async runStage2Routing(order: PendingOrder, session: UserSession) {
    const activeCalls = session.myOrders.filter(c => c.status === 'ORDER_CONFIRMED');

    if (activeCalls.length === 0) {
        // 단독 연산
        const result = await this.kakaoService.calculateSoloRoute(...);
        if (result.durationMin >= DISPATCH_CONFIG.SOLO_SHIT_TIME_MIN) {
            order.reasons.push(`운행시간(${result.durationMin}분) 초과`);
        }
    } else {
        // 합짐(우회) 연산
        const result = await this.kakaoService.calculateDetourRoute(...);
        if (result.timeDiffMin >= DISPATCH_CONFIG.DETOUR_SHIT_TIME_MIN) {
            order.reasons.push(`우회시간(+${result.timeDiffMin}분) 초과`);
        }
    }
}
```

### Stage 3. 수익성 판정 (Pricing)
`PricingEngine` 코어 로직과 플러그인(예외 처리)을 순차적으로 호출합니다.
```typescript
private runStage3Pricing(order: PendingOrder, session: UserSession) {
    const pricingConfig = loadPricingConfig(session.userId); // Repository
    
    const baseResult = this.pricingEngine.calculateDynamicFare(
        order.totalDistanceKm, order.vehicleType, pricingConfig, order.fare
    );

    // 앱 고유 룰 적용 (예: 화물24 수수료 보정)
    const adjusted = this.plugin.applyPricingExceptions(
        order.fare, baseResult.fairPrice, baseResult.minAcceptable
    );

    if (order.fare < adjusted.adjustedMinAcceptable) {
        order.reasons.push(`요율 미달 (실제: ${order.fare} < 하한: ${adjusted.adjustedMinAcceptable})`);
    } else if (order.fare >= adjusted.adjustedFairPrice) {
        order.approvalReasons.push(`꿀콜 🍯 (마진 보존)`);
    }
}
```
