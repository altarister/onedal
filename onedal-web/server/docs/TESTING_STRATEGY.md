# 🧪 1DAL 백엔드 테스트 및 품질 보증 전략

> **문서 상태**: v2.0 (상세 확장판)  
> **목적**: 기사님의 운임과 직결되는 핵심 연산(Pricing, StateMachine) 모듈의 Jest 단위 테스트 코드 예제 명세.

---

## 1. 단위 테스트 (Unit Tests)

가장 핵심이 되는 `PricingEngine`과 `StateMachine`은 DB나 네트워크 의존성이 없는 순수 함수(Pure Function)로 분리되었으므로, Jest를 이용해 극한의 경계값 테스트(Boundary Testing)를 수행할 수 있습니다.

### 1.1 `PricingEngine.test.ts` (요율 엔진 검증)

수수료 계산 및 마진 공제 계산의 수학적 결함이 없는지 검증합니다.

```typescript
// tests/core/engine/PricingEngine.test.ts
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
});
```

### 1.2 `StateMachine.test.ts` (합짐 상태 전이 검증)

관제사의 버튼 클릭에 따라 기사의 앱 모드가 올바르게 바뀌는지 검증합니다.

```typescript
// tests/core/engine/StateMachine.test.ts
import { StateMachine } from '../../../src/core/engine/StateMachine';

describe('StateMachine Transition', () => {
    test('STANDBY에서 첫 콜 확정 시 GATHERING으로 전이된다', () => {
        const dummySession = createDummySession('STANDBY');
        const dummyOrder = { id: 'O-123', pickup: '강남', dropoff: '분당' };

        const result = StateMachine.advanceOnKeep(dummySession, dummyOrder);
        
        expect(result.changed).toBe(true);
        expect(result.newFilter.dispatchPhase).toBe('GATHERING');
        expect(result.newFilter.isSharedMode).toBe(true);
        expect(result.newFilter.destinationKeywords).toContain('분당'); // 회랑 자동 셋팅
    });

    test('마지막 남은 콜을 방출(CANCEL)하면 STANDBY로 완전 롤백된다', () => {
        const session = createDummySession('GATHERING');
        session.myOrders = []; // 본콜 1개가 취소되어 0개가 됨

        const result = StateMachine.rollbackOnCancel(session, 'O-123');
        
        expect(result.newFilter.dispatchPhase).toBe('STANDBY');
        expect(result.newFilter.isSharedMode).toBe(false);
        expect(result.newFilter.destinationKeywords.length).toBe(0);
    });
});
```

---

## 2. 모의 객체 통합 테스트 (Integration with Mocks)

`OrderEvaluator` 파이프라인은 `KakaoService`를 호출하므로 API 횟수 차감을 막기 위해 카카오 API 응답을 Mocking 합니다.

```typescript
// tests/core/engine/OrderEvaluator.test.ts
import { OrderEvaluator } from '../../../src/core/engine/OrderEvaluator';
import { KakaoService } from '../../../src/services/kakaoService';

jest.mock('../../../src/services/kakaoService'); // 자동 Mocking

describe('OrderEvaluator Pipeline', () => {
    test('지오코딩 실패 시 Early Return으로 즉시 거절된다', async () => {
        const mockKakao = new KakaoService();
        // 지오코딩 실패하도록 조작
        (mockKakao.geocode as jest.Mock).mockResolvedValue(null);

        const evaluator = new OrderEvaluator(new InsungPlugin(), mockKakao, new PricingEngine());
        const order = createPendingOrder("미상", "미상");

        await evaluator.evaluate(order, dummySession);

        expect(order.isRejected).toBe(true);
        expect(order.reasons).toContain("지오코딩 실패(좌표 변환 불가)");
    });
});
```
