# 🧠 1DAL 콜 심사 파이프라인 (Order Evaluation Flow)

> **문서 상태**: v3.0 (코드 동기화)  
> **SSOT 코드**: [OrderEvaluator.ts](file:///Users/seungwookkim/reps/onedal/onedal-web/server/src/core/engine/OrderEvaluator.ts)

---

## 1. 설계 의도

앱에서 올라온 `PendingOrder`를 **3단계 파이프라인**으로 심사하여, 장점(`approvalReasons`)과 단점(`rejectionReasons`)을 **모두 수집**합니다. 지오코딩 실패를 제외하면 Short-Circuit 하지 않습니다 — 관제사가 "왜 걸렀는지" 전체 맥락을 볼 수 있도록 하기 위함입니다.

---

## 2. 파이프라인 흐름

```mermaid
flowchart TD
    A["📥 앱에서 PendingOrder 수신"]
    A --> B["Stage 1: 형상 필터\n차종/하한가/상한가/제외키워드/회랑"]
    B --> C{"지오코딩 성공?"}
    C -->|실패| D["❌ Early Return\nreasons: '지오코딩 실패'"]
    C -->|성공| E["Stage 2: 카카오 라우팅\n단독(Solo) or 합짐(Detour)"]
    E --> F["Stage 3: 요율 판정\nPricingEngine + Plugin 보정"]
    F --> G["최종: order-evaluated 소켓 emit"]
    
    style D fill:#ef4444,color:#fff
    style G fill:#10b981,color:#fff
```

---

## 3. 생성자 시그니처 (실제 코드 기준)

```typescript
// ⚠️ 문서 v2.0에서는 3개 인자(plugin, kakaoService, pricingEngine)를 주입했으나,
// 실제 코드는 targetApp 문자열 1개만 받고 내부에서 PluginFactory로 플러그인을 생성합니다.

const evaluator = new OrderEvaluator('insung');  // or 'hwamul24'
await evaluator.evaluate(userId, pendingOrder, io);
```

### `evaluate()` 시그니처

```typescript
evaluate(
    userId: string,                       // 기사 ID (세션 조회용)
    securedOrder: SecuredOrder | PendingOrder,  // 심사 대상 오더
    io: any                               // Socket.IO 인스턴스 (order-evaluated emit용)
): Promise<void>
```

---

## 4. Stage별 동작 요약

### Stage 1: 형상 필터 (`runStage1ShapeFilter`)
- 차종 일치 여부
- 첫짐 절대 하한가 (`STANDBY` 모드일 때만)
- 최대 운임 초과 여부
- 제외 키워드 + 플러그인 커스텀 룰 (`plugin.evaluateCustomRules()`)
- 도착지 회랑 이탈 여부 (합짐 모드일 때만)

### Stage 2: 카카오 라우팅 및 지오코딩 병렬 처리 (Task 13)
지연 시간을 최소화하기 위해 상차지와 하차지의 카카오 지오코딩 API를 `Promise.all`로 병렬 호출하여 안드로이드 앱의 15초 Timeout을 방어합니다.
- **단독** (`activeCalls.length === 0`): `calculateSoloRoute()` → 소요 시간 기준 꿀/똥 판정
- **합짐** (`activeCalls.length > 0`): `optimizeWaypoints()` → `calculateDetourRoute()` → 우회 시간/거리 패널티 판정

> 판정 상수는 [dispatchConfig.ts](file:///Users/seungwookkim/reps/onedal/onedal-web/server/src/config/dispatchConfig.ts) 참조

### Stage 3: 요율 판정 (`runStage3Pricing`)
- `SettingsRepository.loadPricingConfig()` → `PricingEngine.calculateDynamicFare()`
- `plugin.applyPricingExceptions()` → 앱별 수수료 보정
- 결과: `HONEY`(적정가 이상), `FAIR`(하한~적정), `UNDERPAID`(하한 미달)

---

## 5. 출력

심사 완료 후 `securedOrder`에 다음 필드가 주입됩니다:

| 필드 | 설명 |
|------|------|
| `rejectionReasons: string[]` | 모든 패널티 사유 |
| `approvalReasons: string[]` | 모든 장점 |
| `isRejected: boolean` | `rejectionReasons.length > 0`이면 `true` |
| `kakaoTimeExt: string` | UI 표시용 문자열 (예: `+5km, +15분 '콜'`) |
| `status` | `ORDER_AWAITING_DECISION` 으로 승격 |

---

## 6. 비동기 최적화 및 멀티폰 동시성 제어 (Concurrency & Lock)

대규모 배차 트래픽과 멀티폰(여러 대의 기기) 환경에서 안전하게 오더를 선점하기 위해 다음과 같은 동시성 제어가 적용되어 있습니다. **(Task 14)**

### 6.1 멀티폰 Lock 격리 및 스레드 분리
- 여러 대의 폰이 동일한 오더를 동시에 사냥(Scraping -> Detail Request)할 때 발생하는 DB 데드락 및 메모리 오염을 방지하기 위해, 오더 ID 기반의 전용 Lock을 획득합니다.
- 이미 확정(CONFIRMED)되거나 취소(CANCELED)된 과거 오더는 Lock 체크에서 조기 예외 처리되어 불필요한 네트워크 대기를 방지합니다.

### 6.2 ApiClient 자동 재시도 및 Executor 
- 외부 배차 서버(인성, 화물24 등)와의 통신 시 네트워크 불안정을 극복하기 위해 `ApiClient` 내부에 자동 재시도(Retry) 로직과 전용 `Executor`가 할당되어 병목을 해소합니다.
