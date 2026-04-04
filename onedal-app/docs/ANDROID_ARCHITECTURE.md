# 📱 1DAL Android App - Clean Architecture Guide

본 문서는 `onedal-app`의 구조적 역할과 책임을 정의합니다.
초기 버전(MVP)에서 `HijackService.kt` 하나의 파일에 모든 기능이 존재하여 코드 결합도가 극단적으로 높아지는 (God Object) 이슈를 겪었고, 이를 해소하기 위해 엄격한 계층 구조로 리팩터링 되었습니다.

## 패키지 및 모듈 설계도

```text
com.onedal.app
├── MainActivity.kt        // (UI 레벨) 권한 설정 안내 및 서버 타겟 변경 등 상태 관리
├── HijackService.kt       // (관제탑 레벨) 화면 이벤트를 수신하여 아래 매니저들을 차례대로 호출
│
├── api/                   // [네트워크 계층]
│   └── ApiClient.kt       // /scrap 및 /orders 통신, SharedPreferences 로컬/라이브 판별
│
├── core/                  // [비즈니스 로직 계층]
│   ├── AutoTouchManager.kt // 화면 좌표 수집 및 시스템 접근성 권한을 이용한 화면 자동 터치 매크로
│   ├── ScrapParser.kt      // "요금:" 등의 문자열을 파싱하여 객체(SimplifiedOrder)로 만들어 주는 로직 체인
│   └── TelemetryManager.kt // 3초 심장 박동(Heartbeat) 타이머 루프 및 버퍼 전송 스케줄러 관리
│
└── models/                // [데이터 계층]
    └── SharedModels.kt    // 웹 (shared/src/index.ts) 규격과 1:1 대응되는 Data Classes
```

## 계층별 책임

### 1. `HijackService` (Orchestrator)
**가장 단순하게 유지해야 하는 핵심 파일**입니다.
이 클래스 내부에는 네트워크 통신 템플릿, 파싱 if-else 문, 타이머 로직이 들어가서는 안 됩니다. 
오직 이벤트를 수신받고 `parser.parse()` -> `api.send()` -> `touch.perform()` 등 **지시만 내리는 구조**를 유지해야 합니다. 

### 2. `api.ApiClient` (통신망)
`java.net.HttpURLConnection`과 백그라운드 Thread 풀이 숨어있습니다.
Gson 직렬화를 포함하여 타임아웃, 예외 처리(Try-Catch)를 이곳 한곳에서 모두 관리합니다.
새로운 서버 API 엔드포인트가 추가되면 이 모듈에 함수 하나만 만들고, `HijackService`가 그것을 호출하도록 하면 됩니다.

### 3. `core.ScrapParser` (디코더 두뇌)
인성앱과 같은 물류 앱 화면에 표시된 비구조화 문자열(List<String>)에서 규칙(휴리스틱 알고리즘)을 찾아
우리가 다룰 수 있는 DTO(`SimplifiedOrder`)로 규격화합니다. 
추후 3단계 "상세 페이지 파싱" 작업 시 새로운 `parseDetailed(...)` 함수를 만들어 이곳에 추가해야 합니다.

### 4. `core.TelemetryManager` (생체 리듬 / Heartbeat)
데드맨 스위치 생존 신고용 스케줄러입니다. 1DAL 서버 시스템이 `기기가 살아있는지`를 바로 이 클래스가 올리는 3초 주기 `Ping(Scrap)`을 통해 감지합니다.

### 5. `core.AutoTouchManager` (안드로이드 팔/다리)
스크린 터치가 필요할 때 X, Y 좌표를 계산하고 물리적으로 강제 터치 이벤트를 쏩니다.
추후 취소 버튼 터치("CANCEL" 응답 수신 시) 등 새로운 물리 매크로 동작이 필요할 때 확장할 포인트입니다.

## 확장 및 유지보수 규칙
1. **사이드 이펙트 방지**: HTTP 코드가 터치 코드에 영향을 미쳐서는 안 됩니다. 반드시 `HijackService`를 경유해서만 두 기능이 조합됩니다.
2. **동기화 주의**: `TelemetryManager`의 `scrapBuffer`는 멀티스레드 환경에서 동작하므로 항상 `synchronized` 블록을 통하여 Thread-Safety를 준수해야 합니다.
