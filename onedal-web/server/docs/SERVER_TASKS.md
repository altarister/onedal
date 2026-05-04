# 📋 1DAL 백엔드 서버 리팩토링 체크리스트 (Tasks)

> **문서 상태**: v1.0  
> **목적**: `dispatchEngine.ts`를 안전하게 해체하기 위한 Strangler Fig 패턴 단계별 작업 내역서.

---

## 단계별 실행 계획 (Strangler Fig 패턴)

### Step 1: 데이터 접근 계층(Repository) 분리
- `[x]` `repositories/OrderRepository.ts` 생성
- `[x]` `repositories/PlaceRepository.ts` 생성
- `[x]` `dispatchEngine.ts` 내부의 `db.prepare` 로직(orders, places, orderStops)을 Repository로 이관
- `[x]` `handleDecision` 내부의 DB 저장 로직이 정상 작동하는지 테스트

### Step 2: 다이내믹 요율 엔진 추출 (PricingEngine)
- `[x]` `core/engine/PricingEngine.ts` 생성
- `[x]` `loadPricingConfig()`, `calculateDynamicFare()` 로직을 순수 함수로 이동
- `[x]` 단위 테스트 작성 (`PricingEngine.test.ts`) 및 검증
- `[x]` `dispatchEngine.ts`에서 기존 요율 계산 함수 제거

### Step 3: 콜 심사원 로직 추출 (OrderEvaluator)
- `[x]` `core/engine/OrderEvaluator.ts` 생성
- `[x]` 형상 필터 검증 로직 이동 (Stage 1)
- `[x]` 카카오/OSRM 궤적 연산 호출 로직 이동 (Stage 2)
- `[x]` `PricingEngine` 연동 (Stage 3)
- `[x]` `dispatchEngine.ts`의 `evaluateNewOrder` 함수를 `OrderEvaluator` 호출로 대체

### Step 4: 합짐 상태 머신 추출 (StateMachine)
- `[x]` `core/engine/StateMachine.ts` 생성
- `[x]` `updateActiveFilter`, `recalculateActiveKakaoRoute` 로직 등 상태 전이 규칙 캡슐화
- `[x]` `dispatchEngine.ts`에서 상태 업데이트 로직 대체
- `[x]` `dispatchEngine.ts`의 상태 전이 하드코딩 제거 및 `StateMachine` 연동

### Step 5: 다중 앱 플러그인 아키텍처 도입 (Multi-App Support)
- `[x]` `core/plugins/IAppPlugin.ts` 인터페이스 생성
- `[x]` `core/plugins/insung/InsungPlugin.ts` 생성 (기존 정규화 로직 이식)
- `[x]` `core/plugins/hwamul24/Hwamul24Plugin.ts` 뼈대 생성
- `[x]` `routes/scrap.ts`에 `PluginFactory` 라우팅 로직 추가

### Step 6: 잔재 정리 및 안정화
- `[ ]` `dispatchEngine.ts` 파일 완전 삭제 (빈 껍데기 제거)
- `[ ]` 전체 통합 테스트 진행 (Piggyback 응답 ↔ 안드로이드 통신 정상 여부)
- `[ ]` E2E 육안 검증 (관제탑에서 KEEP 버튼 클릭 시 앱이 반응하는지)
