# 🧩 1DAL 백엔드 플러그인 인터페이스 코드 수준 명세서

> **문서 상태**: v2.0 (상세 확장판)  
> **목적**: "인성콜", "화물24" 등 다중 플랫폼 데이터를 백엔드에서 균일하게 처리하기 위한 `IAppPlugin` 스펙 및 라우팅 메커니즘 정의.

---

## 1. IAppPlugin — 백엔드 어댑터 인터페이스

안드로이드 앱에서 올라오는 오더의 텍스트 포맷과 요율 체계는 앱마다 다릅니다. 백엔드 `OrderEvaluator`는 이 인터페이스만 바라보고 연산을 수행합니다.

```typescript
// src/core/plugins/IAppPlugin.ts

export interface AdjustedPricing {
    adjustedFairPrice: number;
    adjustedMinAcceptable: number;
}

/**
 * 다중 콜 어플리케이션(인성콜, 화물24 등)의 상이한 
 * 주소 포맷, 요금 체계, 필터 룰을 정규화하는 플러그인 인터페이스입니다.
 */
export interface IAppPlugin {
    
    /** 플러그인 고유 식별자 (예: 'insung', 'hwamul24') */
    readonly appId: string;

    /**
     * [주소 정규화]
     * 앱마다 다른 동/호수 표기법이나 괄호를 카카오 API가 인식할 수 있도록 정규화합니다.
     * @param rawAddress 앱에서 파싱된 원본 주소 (예: "경기 성남시 분당구 정자동(네이버본사)")
     * @returns 지오코딩용 정제 주소 (예: "경기 성남시 분당구 정자동")
     */
    normalizeAddress(rawAddress: string): string;

    /**
     * [상호명 정규화]
     * 불필요한 법인 텍스트나 기호를 제거하여 DB(places)에 저장할 형태로 만듭니다.
     * @param rawName 앱에서 파싱된 상호명 (예: "(주)우아한형제들 본사")
     * @returns DB 저장용 정제 상호명 (예: "우아한형제들 본사")
     */
    normalizePlaceName(rawName: string): string;

    /**
     * [요금 예외 처리]
     * 앱마다 수수료 선공제 여부가 다르므로 하한선을 앱에 맞게 재조정합니다.
     * @param actualFare 기사 앱에 표기된 오더의 현재 요금
     * @param fairPrice 요금 엔진이 계산한 '콜센터 수수료가 포함된' 적정 금액
     * @param minAcceptable 요금 엔진이 계산한 '기사의 최대 허용 마지노선'
     * @returns 해당 앱의 특성에 맞게 조정된 적정/하한 요금
     */
    applyPricingExceptions(
        actualFare: number, 
        fairPrice: number, 
        minAcceptable: number
    ): AdjustedPricing;

    /**
     * [커스텀 형상 필터]
     * 앱 고유의 '블랙리스트 텍스트'나 특수 룰을 검사합니다.
     * @param rawText 오더의 모든 텍스트 병합본
     * @returns 패널티 사유 배열 (없으면 빈 배열)
     */
    evaluateCustomRules(rawText: string): string[];
}
```

---

## 2. 플러그인 구현체 (Implementation)

### 2.1 인성콜 구현체 (`InsungPlugin.ts`)

인성콜은 상호명에 `(주)` 나 `주식회사`가 많이 붙으며, 수수료가 포함된 총액을 보여주는 경우가 많습니다.

```typescript
// src/core/plugins/insung/InsungPlugin.ts
import { IAppPlugin, AdjustedPricing } from '../IAppPlugin';

export class InsungPlugin implements IAppPlugin {
    readonly appId = 'insung';

    normalizeAddress(rawAddress: string): string {
        // 인성콜 주소 특징: 끝에 (건물명) 이 붙는 경우가 많음
        return rawAddress.replace(/\(.*?\)$/g, '').trim();
    }

    normalizePlaceName(rawName: string): string {
        // (주), 주식회사, 유한회사 등 제거
        return rawName.replace(/\(주\)|주식회사|유한회사|\s/g, '').trim();
    }

    applyPricingExceptions(actualFare: number, fairPrice: number, minAcceptable: number): AdjustedPricing {
        // 인성콜은 특별한 예외 없이 표준 요율을 따릅니다.
        return { adjustedFairPrice: fairPrice, adjustedMinAcceptable: minAcceptable };
    }

    evaluateCustomRules(rawText: string): string[] {
        const reasons: string[] = [];
        if (rawText.includes("착불")) reasons.push("착불 오더 (인성콜 룰)");
        return reasons;
    }
}
```

### 2.2 화물24 구현체 (`Hwamul24Plugin.ts`)

화물24는 수수료가 이미 공제된 '순수익' 형태로 표기되는 경우가 있습니다. 이 경우 하한선 계산 방식이 달라집니다.

```typescript
// src/core/plugins/hwamul24/Hwamul24Plugin.ts
import { IAppPlugin, AdjustedPricing } from '../IAppPlugin';

export class Hwamul24Plugin implements IAppPlugin {
    readonly appId = 'hwamul24';

    normalizeAddress(rawAddress: string): string {
        return rawAddress.split(',')[0].trim(); // 예: 콤마 뒤 상세주소 날림
    }

    normalizePlaceName(rawName: string): string {
        return rawName.replace(/\[.*?\]/g, '').trim(); // 대괄호 제거
    }

    applyPricingExceptions(actualFare: number, fairPrice: number, minAcceptable: number): AdjustedPricing {
        // 화물24는 수수료가 이미 공제된 금액이라 가정할 경우,
        // fairPrice 자체를 수수료 0% 기준으로 재산출한 값으로 덮어씌워야 합니다.
        // (실제 로직은 기획에 따라 변동 가능)
        return { 
            adjustedFairPrice: fairPrice * 1.15, // 예시: 보정치
            adjustedMinAcceptable: minAcceptable * 1.15 
        };
    }

    evaluateCustomRules(rawText: string): string[] {
        return []; // 특별한 커스텀 룰 없음
    }
}
```

---

## 3. 플러그인 팩토리 및 라우팅 (`PluginFactory.ts`)

앱에서 보내는 `POST /api/scrap` 의 `req.body.targetApp` 값에 따라 플러그인을 동적으로 생성합니다.

```typescript
// src/core/plugins/PluginFactory.ts
import { IAppPlugin } from './IAppPlugin';
import { InsungPlugin } from './insung/InsungPlugin';
import { Hwamul24Plugin } from './hwamul24/Hwamul24Plugin';

export class PluginFactory {
    static getPlugin(targetApp: string = 'insung'): IAppPlugin {
        switch (targetApp.toLowerCase()) {
            case 'hwamul24':
                return new Hwamul24Plugin();
            case 'insung':
            default:
                return new InsungPlugin();
        }
    }
}
```

---

## 4. 백엔드 심사원 적용 예시 (`OrderEvaluator.ts`)

```typescript
// src/core/engine/OrderEvaluator.ts

export class OrderEvaluator {
    private plugin: IAppPlugin;

    constructor(targetApp: string) {
        this.plugin = PluginFactory.getPlugin(targetApp);
    }

    public async evaluate(order: PendingOrder) {
        // 1. 주소 정규화 (플러그인 의존)
        const cleanPickup = this.plugin.normalizeAddress(order.pickup);
        
        // 2. 카카오 지오코딩
        const pCoord = await geocodeAddress(cleanPickup);

        // ... 카카오 연산 로직 생략 ...

        // 3. 다이내믹 요율 연산
        const { fairPrice, minAcceptable } = PricingEngine.calculate(...);
        
        // 4. 앱 특화 요율 예외 처리 (플러그인 의존)
        const { adjustedFairPrice, adjustedMinAcceptable } = 
            this.plugin.applyPricingExceptions(order.fare, fairPrice, minAcceptable);

        if (order.fare < adjustedMinAcceptable) {
            order.reasons.push("요율 미달");
        }
        
        // 5. 앱 고유 블랙리스트 룰 (플러그인 의존)
        const customReasons = this.plugin.evaluateCustomRules(order.rawText);
        order.reasons.push(...customReasons);
    }
}
```
