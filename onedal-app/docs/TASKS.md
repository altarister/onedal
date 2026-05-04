# 📋 1DAL 안드로이드 앱 리팩토링 문서 태스크 목록

> **목적**: 시니어 앱 개발자가 이 폴더의 문서만 보고 구현할 수 있을 수준의 기술 명세서를 완성하기 위한 체크리스트

---

## 기존 문서 (✅ 이미 존재)
- `[x]` [PRD.md](./PRD.md) — 제품 요구사항 정의서
- `[x]` [TRD.md](./TRD.md) — 기술 요구사항 정의서
- `[x]` [ANDROID_ARCHITECTURE.md](./ANDROID_ARCHITECTURE.md) — 현재 패키지 구조 및 계층 가이드
- `[x]` [APP_BLUEPRINT.md](./APP_BLUEPRINT.md) — 사용자 라이프사이클, UI/UX, 플러그인 아키텍처 기획

---

## 신규 작성 필요 문서

### 🔴 P0 — 이것 없이는 구현 불가능
- `[x]` **API_SPEC.md** — 앱 ↔ 서버 간 전체 API 명세서 ✅
  - 모든 HTTP 엔드포인트 (URL, Method, 요청/응답 JSON 스키마)
  - 소켓(Piggyback) 이벤트 흐름 및 폴링 프로토콜
  - 에러 코드 및 예외 응답 규격
  - *현재 `ApiClient.kt` 461줄 + `SharedModels.kt` 206줄에 흩어져 있음*

- `[x]` **DATA_MODELS.md** — 공유 데이터 모델 명세서 ✅
  - `SimplifiedOfficeOrder`, `DetailedOfficeOrder`, `FilterConfig` 등 코어 타입의 필드별 의미, 타입, 필수/선택 여부
  - 앱(Kotlin) ↔ 서버(TypeScript) 간 1:1 대응 매핑 테이블
  - *현재 `SharedModels.kt`에 코드 주석으로만 존재*

- `[x]` **SCREEN_STATE_MACHINE.md** — 화면 상태 전이 다이어그램 ✅
  - `ScreenContext` enum의 각 상태(`LIST`, `DETAIL_PRE_CONFIRM`, `POPUP_MEMO` 등)별 진입 조건 및 전이 규칙
  - 팝업 서핑(Surfing) 상태 머신 (`IDLE → WAITING_FOR_MEMO → WAITING_FOR_PICKUP → WAITING_FOR_DROPOFF → DONE`)
  - 동명이동 3단계 검증 분기 흐름
  - *현재 `HijackService.kt` 897줄 코드에만 녹아있음*

### 🟡 P1 — 없으면 삽질이 심해짐
- `[x]` **SEQUENCE_DIAGRAMS.md** — 주요 시나리오 시퀀스 다이어그램 ✅
  - AUTO 모드: 리스트 스캔 → 광클 → 확정 → 팝업 서핑 → 서버 판결(Piggyback) → 화면 터치
  - MANUAL 모드: 기사님 수동 클릭 → 서버 보고 → 관제탑 결재 대기
  - 데스밸리 타임아웃 → 비상 보고 → 강제 취소
  - 동명이동 3단계 검증 플로우

- `[x]` **SHARED_PREFERENCES_SPEC.md** — 로컬 저장소(SharedPreferences) 키 명세 ✅
  - 모든 키(`deviceId`, `isLiveMode`, `activeFilter`, `deathValleyTimeout`, `pendingAckDecisionId` 등)
  - 키별 타입, 기본값, 읽기/쓰기 주체, 생명주기
  - *현재 `ApiClient.kt`, `MainActivity.kt`, `HijackService.kt` 3곳에 산재*

- `[x]` **EDGE_CASES.md** — 엣지케이스 및 방어 로직 명세 ✅
  - 고스트 응답 방어 (Ghost Defense): 과거 세션의 잔류 판결 폐기 로직
  - 팝업 잔상 방어 (Popup Residue): 닫기 애니메이션 중 오탐 방어
  - 데스밸리(Death Valley) 타이머: 서버 무응답 시 패널티 방어
  - 동명이동(Caution Dong) 2-3단계 검증
  - 핑거프린트 중복 이벤트 방어
  - 자기 자신(1DAL) 텍스트 오염 방어
  - *현재 `HijackService.kt`에 전투 경험으로 하드코딩됨*

### 🟢 P2 — 있으면 품질 향상
- `[ ]` **UI_WIREFRAMES.md** — 화면 와이어프레임/목업
  - 대시보드 탭 레이아웃
  - 설정 탭 레이아웃
  - 각 상태별 화면 스케치 (접근성 ON/OFF, 서버 연결/끊김 등)

- `[ ]` **PLUGIN_INTERFACE_SPEC.md** — 플러그인 인터페이스 코드 수준 명세
  - `BaseScrapParser` 인터페이스 메서드 시그니처 및 반환값 정의
  - `BaseAutomationEngine` 인터페이스 정의
  - `EngineRouter` 앱 패키지 감지 → 엔진 스위칭 로직
  - 플러그인별 키워드 사전(`ScreenKeywords`) 등록 방법

- `[ ]` **TESTING_STRATEGY.md** — 테스트 전략
  - 단위 테스트 범위 (Parser, Filter 로직 등)
  - 통합 테스트 (서버 Mock 연동)
  - 수동 E2E 검증 체크리스트

---

## 문서 작성 순서 (권장)

```
1. SCREEN_STATE_MACHINE.md  ← HijackService의 두뇌를 먼저 문서화
2. API_SPEC.md              ← 서버와의 계약을 명확히
3. DATA_MODELS.md           ← 주고받는 데이터 형태 확정
4. SEQUENCE_DIAGRAMS.md     ← 위 세 문서를 엮는 시나리오 플로우
5. SHARED_PREFERENCES_SPEC.md
6. EDGE_CASES.md
7. UI_WIREFRAMES.md
8. PLUGIN_INTERFACE_SPEC.md
9. TESTING_STRATEGY.md
```
