# 📋 1DAL 백엔드 서버 리팩토링 체크리스트

> **문서 상태**: v2.0 (Phase 2)  
> **목적**: 1기 Strangler Fig 완료 후, 남은 구조적 부채를 안전하게 청소하기 위한 실행 내역서.

---

## 1기 리팩토링 (완료)

> Strangler Fig 패턴으로 `dispatchEngine.ts` God Object를 해체한 단계입니다.

- `[x]` Repository 계층 분리 (OrderRepository, PlaceRepository, SettingsRepository)
- `[x]` PricingEngine 순수 함수 추출 + 단위 테스트
- `[x]` OrderEvaluator 콜 심사 파이프라인 분리 + 단위 테스트
- `[x]` StateMachine 상태 전이 캡슐화 + 단위 테스트
- `[x]` 다중 앱 플러그인 아키텍처 (IAppPlugin → InsungPlugin, Hwamul24Plugin)

---

## 2기 리팩토링 (현재)

> 1기에서 위임만 된 채 남은 중복/혼재 로직을 정리합니다.

### Step 1: 코드 위생 청소
- `[ ]` 루트 레벨 스크래치/테스트 파일 15개 삭제
- `[ ]` `TERMINAL_STATUSES`, `getActiveCalls()` 중복 3곳 → `core/constants.ts` + `core/helpers.ts`로 통합
- `[ ]` `normalizePlaceName()` 중복 → `InsungPlugin` 메서드로 단일화
- `[ ]` `@deprecated applyFilter()` 삭제 (`filterManager.ts`)

### Step 2: 비즈니스 로직 올바른 위치로 이관
- `[ ]` `socketHandlers.ts` 인라인 로직 3건 → `dispatchEngine.ts` 함수로 추출
  - `dispatch-complete` (35줄) → `completeOrder()`
  - `start-two-track` (85줄) → `startTwoTrack()`
  - `create-home-return` (75줄) → `createHomeReturn()`
- `[ ]` 데스밸리 타이머 중복 (`orders.ts` + `detail.ts`) → `dispatchEngine.ts`의 `startDeathValleyTimer()` 1곳으로 통합
- `[ ]` `db.prepare()` 직접 호출 3곳 → 기존 Repository 메서드 호출로 교체

### Step 3: 검증
- `[ ]` TypeScript 컴파일 (`tsc --noEmit`)
- `[ ]` 기존 단위 테스트 (`jest`)
- `[ ]` 서버 기동 (`pnpm dev`)
- `[ ]` Piggyback/Decision E2E 플로우 확인
