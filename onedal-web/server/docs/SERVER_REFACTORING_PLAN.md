# 🔧 1DAL 관제탑 서버(Node.js) 코드 리팩토링 실행 계획

## 핵심 원칙: Strangler Fig (교살자 무화과) 패턴

> **절대로 작동 중인 코드를 한꺼번에 뜯지 않는다.**  
> 새 구조를 옆에 만들고, 기존 코드를 한 조각씩 새 구조로 이사시킨 뒤, 빈 껍데기가 된 원본을 제거한다. 안드로이드 앱 리팩토링에서 성공적으로 증명된 방식입니다.

```mermaid
flowchart LR
    A["🏚️ 현재 dispatchEngine.ts<br/>(1168줄 God Object)"] 
    B["🏗️ 새 모듈들을<br/>옆에 건설"]
    C["🔄 한 기능씩<br/>새 모듈로 이사"]
    D["🗑️ 빈 껍데기<br/>제거"]
    
    A --> B --> C --> D
    
    style A fill:#f44336,color:#fff
    style D fill:#4CAF50,color:#fff
```

---

## 현재 파일 구조 및 문제점 (AS-IS)

```text
server/src/
├── services/
│   ├── dispatchEngine.ts      ← 1168줄 (🔴 God Object)
│   │   - 요금 계산, DB 저장, 카카오 API 호출, 필터 검증, 상태 머신이 모두 섞여 있음
│   ├── kakaoService.ts        ← 514줄 (🟡 카카오 API 및 TSP 최적화 혼재)
│   └── geoService.ts          ← 403줄 (회랑 추출 로직)
├── routes/
│   ├── scrap.ts               ← 하트비트 및 텔레메트리
│   └── devices.ts             ← 410줄 (라우터에 비즈니스 로직 혼재)
└── state/
    └── userSessionStore.ts    ← 메모리 세션 관리
```

### 문제점 진단
1. **단일 책임 원칙 위배**: `dispatchEngine.ts` 하나가 DB 통신, 요율 계산, 합짐 상태 전이(State Machine), 카카오 궤적 연산을 모두 처리하고 있습니다.
2. **다중 앱 지원(확장성) 부재**: 안드로이드 앱은 "인성콜"과 "24시"를 구분하도록 수정되었으나, 서버는 아직 하드코딩된 로직이 많아 플러그인화가 필요합니다.
3. **DB 강결합**: 비즈니스 로직 중간에 원시 SQL 쿼리(`db.prepare(...)`)가 섞여 있어 테스트와 재사용이 어렵습니다.

---

## 리팩토링 목표 구조 (TO-BE)

```text
server/src/
├── core/
│   ├── engine/
│   │   ├── OrderEvaluator.ts      [NEW] 콜 평가(필터 검증/수익성 판독) 전담
│   │   ├── PricingEngine.ts       [NEW] 동적 요금 및 하한가 계산 전담
│   │   ├── StateMachine.ts        [NEW] 합짐 상태 전이(STANDBY→GATHERING) 전담
│   │   └── RouteManager.ts        [NEW] 경로 재탐색 및 세션 궤적 복구 전담
│   └── plugins/                   [NEW] 안드로이드와 동일한 다중 앱 지원 구조
│       ├── IAppPlugin.ts
│       ├── insung/
│       └── hwamul24/
├── repositories/                  [NEW] 데이터베이스 접근 계층 (DAL)
│   ├── OrderRepository.ts
│   └── PlaceRepository.ts
├── services/
│   ├── kakaoService.ts            ← 카카오 API 순수 호출로 축소
│   └── geoService.ts              ← 유지
├── routes/                        ← API 핸들러 (비즈니스 로직은 engine으로 위임)
└── state/                         ← 유지
```

---

## 단계별 실행 계획

### Step 1: 데이터 접근 계층(Repository) 분리
**작업 내용:**
- `dispatchEngine.ts` 내부의 `orders`, `places`, `orderStops` INSERT/UPDATE 원시 SQL 쿼리 추출
- DB 저장 로직을 전담하는 Repository 클래스 생성
**파일 변경:**
- `[NEW]` `repositories/OrderRepository.ts`
- `[NEW]` `repositories/PlaceRepository.ts`
- `[MODIFY]` `dispatchEngine.ts`의 `handleDecision` 내 DB 로직을 Repository 호출로 변경

### Step 2: 다이내믹 요율 엔진 추출 (PricingEngine)
**작업 내용:**
- `loadPricingConfig()`, `calculateDynamicFare()` 등 돈과 관련된 연산 로직 추출
- 차종별 단가, 수수료, 마진율 계산을 순수 함수로 분리
**파일 변경:**
- `[NEW]` `core/engine/PricingEngine.ts`
- `[MODIFY]` `dispatchEngine.ts`에서 요율 계산 로직 삭제

### Step 3: 콜 심사원 로직 추출 (OrderEvaluator)
**작업 내용:**
- `dispatchEngine.ts`의 덩치가 가장 큰 `evaluateNewOrder` 함수를 별도 모듈로 분리
- 형상 필터 검증(차종, 금액, 블랙리스트) -> 지오코딩 -> 카카오 궤적 판단 -> 종합 꿀콜/똥콜 라벨링 과정을 하나의 파이프라인으로 구성
**파일 변경:**
- `[NEW]` `core/engine/OrderEvaluator.ts`

### Step 4: 합짐 상태 머신 추출 (StateMachine)
**작업 내용:**
- `handleDecision` 내부의 `STANDBY` → `GATHERING` → `DRIVING` 상태 전이 로직 분리
- 필터 업데이트(`updateActiveFilter`) 호출 로직을 StateMachine 내부로 은닉
**파일 변경:**
- `[NEW]` `core/engine/StateMachine.ts`

### Step 5: 백엔드 플러그인 아키텍처 도입 (Multi-App Support)
**작업 내용:**
- 안드로이드 앱에서 올라오는 `req.body.targetApp` ("insung" | "hwamul24") 에 따라 파싱 규칙 및 주소 정규화 규칙 분기 처리
- `normalizePlaceName` 등의 하드코딩 로직을 플러그인으로 이동
**파일 변경:**
- `[NEW]` `core/plugins/IAppPlugin.ts`
- `[NEW]` `core/plugins/insung/InsungPlugin.ts`
- `[NEW]` `core/plugins/hwamul24/Hwamul24Plugin.ts`

---

## ⚠️ 리팩토링 불가 영역 (건드리지 않음)
| 코드 | 이유 |
|------|------|
| `state/userSessionStore.ts` | 현재 인메모리 기반으로 아주 잘 작동하며, Redis 도입 전까지는 유지 |
| `state/filterManager.ts` | 프론트엔드-서버 간의 Socket 동기화가 깊게 물려있어 보존 |

## User Review Required

> [!IMPORTANT]
> 안드로이드 때와 마찬가지로 한 번에 모든 것을 바꾸지 않고 **Step 1부터 하나씩 차근차근 추출**하는 것이 가장 안전합니다.
> 
> 1. 이 계획서 방향이 마음에 드시나요?
> 2. 동의하신다면, **Step 1 (Repository 패턴 추출)** 부터 곧바로 작업을 시작해도 될까요?
