# 🔧 1DAL 안드로이드 앱 코드 리팩토링 실행 계획

## 핵심 원칙: Strangler Fig (교살자 무화과) 패턴

> **절대로 작동 중인 코드를 한꺼번에 뜯지 않는다.**  
> 새 구조를 옆에 만들고, 기존 코드를 한 조각씩 새 구조로 이사시킨 뒤, 빈 껍데기가 된 원본을 제거한다.

```mermaid
flowchart LR
    A["🏚️ 현재 HijackService<br/>(897줄 God Object)"] 
    B["🏗️ 새 모듈들을<br/>옆에 건설"]
    C["🔄 한 기능씩<br/>새 모듈로 이사"]
    D["🗑️ 빈 껍데기<br/>제거"]
    
    A --> B --> C --> D
    
    style A fill:#f44336,color:#fff
    style D fill:#4CAF50,color:#fff
```

---

## 현재 파일 구조 (AS-IS)

```text
com.onedal.app/
├── HijackService.kt          ← 897줄 (🔴 God Object)
├── MainActivity.kt            ← 460줄 (🟡 View+Logic 혼재)
├── api/
│   └── ApiClient.kt           ← 461줄 (🟡 네트워크+로컬저장 혼재)
├── core/
│   ├── IScrapParser.kt        ← ✅ 이미 인터페이스 존재!
│   ├── ScrapParser.kt         ← ✅ 위임자 패턴 구현 완료
│   ├── NativeScrapParser.kt   ← 파싱 로직 (인성콜 전용)
│   ├── AutoTouchManager.kt    ← 터치 매크로
│   ├── TelemetryManager.kt    ← 텔레메트리
│   ├── ScreenKeywords.kt      ← 화면 판별 키워드
│   └── ...기타
└── models/
    └── SharedModels.kt        ← 데이터 클래스들
```

> **좋은 발견:** `IScrapParser` 인터페이스와 `ScrapParser` 위임자(Delegator)가 이미 존재합니다. 이것을 `BaseScrapParser`의 기반으로 활용할 수 있어 작업량이 크게 줄어듭니다.

---

## 리팩토링 목표 구조 (TO-BE)

```text
com.onedal.app/
├── HijackService.kt           ← 200줄 이하 (이벤트 라우터만)
├── MainActivity.kt            ← 50줄 이하 (NavHost만)
├── api/
│   └── ApiClient.kt           ← 그대로 유지 (Phase 3 이후 정리)
├── core/
│   ├── engine/
│   │   ├── ScreenDetector.kt      [NEW] 화면 판별 전담
│   │   ├── SessionManager.kt      [NEW] 세션 변수 + 초기화 전담
│   │   ├── PopupSurfingMachine.kt  [NEW] 팝업 서핑 상태 머신
│   │   ├── CautionDongVerifier.kt  [NEW] 동명이동 3단계 검증
│   │   └── DeathValleyTimer.kt     [NEW] 데스밸리 타이머
│   ├── IScrapParser.kt         ← 유지 (BaseScrapParser 역할)
│   ├── ScrapParser.kt          ← 유지 (EngineRouter 역할로 확장)
│   ├── AutoTouchManager.kt     ← 유지
│   ├── TelemetryManager.kt     ← 유지
│   └── ScreenKeywords.kt       ← 유지
├── plugins/
│   └── insung/
│       ├── InsungParser.kt        ✅ NativeScrapParser에서 이름 변경 및 이동
│       └── InsungKeywords.kt      ✅ INSUNG 키워드 분리
├── ui/
│   ├── MainViewModel.kt          [NEW] SharedPrefs 접근 + 폴링
│   ├── DashboardScreen.kt        [NEW] 상태 탭 UI
│   └── SettingsScreen.kt         [NEW] 설정 탭 UI
└── models/
    └── SharedModels.kt         ← 유지
```

---

## 단계별 실행 계획

### Step 1: HijackService에서 화면 판별 로직 추출 (ScreenDetector)

**작업 내용:**
- `detectScreenContext()` 함수를 `ScreenDetector.kt`로 추출
- `isPopupResidue()` 함수도 함께 이동
- `HijackService`에서는 `screenDetector.detect(rawScreenStr, keywords)` 한 줄로 호출

**파일 변경:**
- `[NEW]` `core/engine/ScreenDetector.kt` — 화면 판별 전담 (약 80줄)
- `[MODIFY]` `HijackService.kt` — detectScreenContext 본문 삭제, ScreenDetector 호출로 대체

**검증:** 리팩토링 전후 동일한 화면 텍스트 → 동일한 ScreenContext 반환 확인

---

### Step 2: 세션 상태 변수 추출 (SessionManager)

**작업 내용:**
- `currentSessionOrderId`, `isAutoSessionActive`, `surfingState` 등 9개 세션 변수를 `SessionManager` 클래스로 추출
- `resetSessionState()` 함수도 이동
- `ensureSessionId()` 도 이동

**파일 변경:**
- `[NEW]` `core/engine/SessionManager.kt` — 세션 상태 + 초기화 (약 60줄)
- `[MODIFY]` `HijackService.kt` — 9개 변수 선언 삭제, `sessionManager.xxx`로 접근

**검증:** 세션 초기화(리스트 복귀) 시 모든 변수가 정상 리셋되는지 확인

---

### Step 3: 팝업 서핑 상태 머신 추출 (PopupSurfingMachine)

**작업 내용:**
- `SurfingState` enum + 팝업 서핑 로직 (`handleConfirmedScreen` 내부의 IDLE→MEMO→PICKUP→DROPOFF→DONE 분기)을 별도 클래스로 추출
- `accumulatedDetailText` 관리도 이동

**파일 변경:**
- `[NEW]` `core/engine/PopupSurfingMachine.kt` — 서핑 FSM (약 120줄)
- `[MODIFY]` `HijackService.kt` — handleConfirmedScreen 내부 서핑 로직 삭제

**검증:** 확정 화면 진입 → 적요→출발지→도착지 순서대로 서핑 → /detail 전송 성공

---

### Step 4: 동명이동 + 데스밸리 추출

**작업 내용:**
- `CAUTION_DONGS`, `cautionAction`, 3단계 검증 로직을 `CautionDongVerifier.kt`로 추출
- 데스밸리 타이머 (`startDeathValleyTimer`, `cancelDeathValleyTimer`) 를 `DeathValleyTimer.kt`로 추출

**파일 변경:**
- `[NEW]` `core/engine/CautionDongVerifier.kt` (약 60줄)
- `[NEW]` `core/engine/DeathValleyTimer.kt` (약 40줄)
- `[MODIFY]` `HijackService.kt` — 해당 로직 제거

**검증:** 동명이동 의심 동네 → 3단계 → 정상 판단 / 데스밸리 30초 → 자동취소

---

### Step 5: MainActivity UI 분리 (MVVM)

**작업 내용:**
- `MainActivity.kt`의 SharedPrefs 폴링 로직을 `MainViewModel.kt`로 이동
- 460줄 단일 Column을 `DashboardScreen.kt`와 `SettingsScreen.kt`로 분리
- `MainActivity`에는 Bottom Navigation + NavHost만 남김

**파일 변경:**
- `[NEW]` `ui/MainViewModel.kt` (약 80줄)
- `[NEW]` `ui/DashboardScreen.kt` (약 100줄)
- `[NEW]` `ui/SettingsScreen.kt` (약 120줄)
- `[MODIFY]` `MainActivity.kt` — 50줄 이하로 경량화

**검증:** 앱 실행 → 2탭 UI 정상 표시 → 설정 변경 시 SharedPrefs 반영

---

## 예상 작업량 및 위험도

| Step | 작업 | HijackService 줄 감소 | 위험도 | 이유 |
|:---:|------|:---:|:---:|------|
| 1 | ScreenDetector 추출 | -80줄 | 🟢 낮음 | 순수 함수, 부작용 없음 |
| 2 | SessionManager 추출 | -50줄 | 🟢 낮음 | 변수 이동만, 로직 변경 없음 |
| 3 | PopupSurfingMachine 추출 | -150줄 | 🟡 중간 | 상태 머신 분리, 콜백 연결 필요 |
| 4 | CautionDong + DeathValley | -100줄 | 🟡 중간 | 타이머 + 검증 로직 이동 |
| 5 | MainActivity MVVM | MainActivity -400줄 | 🟢 낮음 | UI만 분리, 비즈니스 로직 없음 |

**예상 최종 결과:** `HijackService.kt` 897줄 → **약 500줄** (이벤트 라우팅 + 핸들러 호출)

## ⚠️ 리팩토링 불가 영역 (건드리지 않음)

| 코드 | 이유 |
|------|------|
| `onAccessibilityEvent()` 메인 루프 | Android 프레임워크 콜백, 반드시 HijackService에 존재해야 함 |
| `gatherNodeTexts()` / `extractAllTextNodes()` | AccessibilityNodeInfo 직접 조작, Service 클래스에서만 가능 |
| `AutoTouchManager.kt` | 이미 단일 책임으로 잘 분리됨 |
| `TelemetryManager.kt` | 이미 단일 책임으로 잘 분리됨 |

## User Review Required

> [!IMPORTANT]
> **Step 1~4는 HijackService 분해**, **Step 5는 MainActivity UI 분리**입니다.
> 
> 1. 이 순서대로 한 Step씩 진행하면서 매 Step 후 빌드 & 동작 확인 하는 방식이 가장 안전합니다.
> 2. Step 1(ScreenDetector)부터 바로 시작해도 될까요?
> 3. 혹시 특정 Step을 먼저 하고 싶거나, 빼고 싶은 것이 있으신가요?
