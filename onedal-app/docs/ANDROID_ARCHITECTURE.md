# 📱 1DAL 안드로이드 앱 아키텍처

> **문서 상태**: v2.0 — **2026-08-09 코드 전수 대조 후 재작성**
> **작성 원칙**: 코드에 실제로 들어간 것만 적는다. 계획은 [todo.md](../../todo.md)에 적는다.

> [!IMPORTANT]
> **v1.0 문서는 사실이 아닌 내용을 다수 포함하고 있었습니다.**
> "Compose 의존성 완벽 제거", "Coroutines 기반", `LocationTracker`,
> `FusedLocationProviderClient`, `ACCESS_BACKGROUND_LOCATION` 권한,
> "TelemetryManager 3초 하트비트" — **전부 사실이 아니었습니다.**
> 아래 내용은 전부 실제 파일·라인과 대조했습니다.

---

## 1. 런타임 사실 (Facts)

| 항목 | 실제 값 |
|---|---|
| UI | **Jetpack Compose** (제거되지 않았습니다. `kotlin.compose` 플러그인 + `compose-bom` + `material3` 사용 중) |
| 비동기 | **`Executors` + `Handler(Looper)`**. Coroutines는 쓰지 않습니다 |
| 네트워크 | `java.net.HttpURLConnection` (OkHttp/Retrofit 아님) + Gson |
| 핵심 엔진 | `AccessibilityService` — 화면 노드 읽기 + 제스처 터치 |
| minSdk / targetSdk | 26 / 35 |
| 선언 권한 | `INTERNET`, `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` — **이 2개뿐** |
| 위치 권한 | ❌ **선언 안 됨** (`ACCESS_FINE_LOCATION` 없음) |
| 하트비트 | **60초** (`HEARTBEAT_INTERVAL_MS`). 판결 대기 중엔 1초 고속 폴링 |
| 총 소스 | 25개 파일 / 약 3,840줄 |
| 테스트 | **0개** (`test/`·`androidTest/` 디렉터리 자체가 없음) |

> ⚠️ **위치 권한 미선언의 결과**: `TelemetryManager`가 `getLastKnownLocation()`을 호출하지만
> `SecurityException`이 발생하고 catch로 삼켜져 **`lat`/`lng`가 항상 `null`로 전송**됩니다.
> 앱 GPS 텔레메트리는 코드는 있으나 동작하지 않습니다. → todo.md Phase 4

---

## 2. 실제 패키지 구조

```text
com.onedal.app
├── MainActivity.kt              (113줄) 2탭 UI 진입점
├── HijackService.kt             (757줄) ⚠️ 최대 파일. 접근성 이벤트 라우터
│
├── api/
│   └── ApiClient.kt             (473줄) HTTP + Executor 3분리
│
├── core/
│   ├── AppInfo.kt               ⭐ PackageManager 런타임 버전 조회
│   ├── AppLogger.kt             d/i/w/e/v + roadmap. v는 BuildConfig.DEBUG에 연동
│   ├── TelemetryManager.kt      하트비트 + 디바운스 + 피기백 수신
│   ├── ScrapParser.kt           targetApp → 플러그인 위임 라우터
│   ├── IScrapParser.kt          파서 인터페이스 (실제 이름)
│   ├── ScreenKeywords.kt        화면 판별 키워드 사전 자료구조
│   ├── ScreenTextNode.kt        텍스트 + 좌표 + 노드 참조
│   ├── AutoTouchManager.kt      제스처 터치 / 텍스트 검색 클릭
│   ├── LocationTextAnalyzer.kt  주소 텍스트 분석
│   └── engine/
│       ├── ScreenDetector.kt        키워드 사전 기반 화면 판별
│       ├── SessionManager.kt        콜 1건 처리 세션 상태 9종
│       ├── PopupSurfingMachine.kt   IDLE→MEMO→PICKUP→DROPOFF→DONE
│       ├── DeathValleyTimer.kt      서버 무응답 시 자동 취소
│       └── CautionDongVerifier.kt   동명이동 3단계 검증 (동네 100여 개)
│
├── plugins/
│   ├── insung/    InsungParser.kt (360줄) + InsungKeywords.kt
│   └── hwamul24/  Hwamul24Parser.kt (347줄) + Hwamul24Keywords.kt
│
├── models/SharedModels.kt       서버 @onedal/shared 와 대응하는 DTO
└── ui/                          Compose 화면
    ├── MainViewModel.kt · DashboardScreen.kt · SettingsScreen.kt
```

> **존재하지 않는 것** (v1.0 문서가 언급했던 것): `LocationTracker`

---

## 3. 계층별 책임

### `HijackService` — 이벤트 라우터
`TYPE_WINDOW_CONTENT_CHANGED`를 받아 → 핑거프린트로 중복 스킵 → `ScreenDetector`로 화면 판별 →
화면별 핸들러로 분기합니다. **판단은 서버가 하고 앱은 눈과 손 역할만** 한다는 것이 설계 원칙입니다.

```
LIST                → 콜 스캔 → 4대 필터 통과 시 광클
DETAIL_PRE_CONFIRM  → /confirm 전송 + 확정 버튼 클릭
DETAIL_CONFIRMED    → 팝업 서핑 시작
POPUP_MEMO/PICKUP/DROPOFF → 텍스트 수집 → 마지막에 /detail 전송
```

> ⚠️ 원래 의도는 "지시만 내리는 얇은 오케스트레이터"였으나 현재 757줄이며
> 인성콜 전용 문자열(`"닫기"`, `"취소"`, `"전화1"`, `"도착지"`)이 하드코딩되어 있습니다.
> 이 때문에 화물24시에서는 판결 집행이 실패합니다. → todo.md Phase 5

### `ApiClient` — Executor 3분리
실전에서 나온 설계입니다. 비상 통신이 배차 통신에 절대 블로킹되지 않습니다.

| Executor | 스레드 | 담당 |
|---|---|---|
| `dispatchExecutor` | 2 | `/confirm`, `/detail` |
| `emergencyExecutor` | 1 (전용) | `/emergency` |
| `telemetryExecutor` | 1 | `/scrap`, `/config/keywords`, `/devices/*` |

`executeWithRetry()`가 1회 자동 재시도를 담당하며 **`/scrap`을 포함한 모든 호출**이 사용합니다.
(`/scrap`은 2026-08-09에 추가 — 생존신고가 1회 실패하면 서버 데드맨이 오작동했습니다)

### `TelemetryManager` — 전송 스케줄러

| 트리거 | 주기 |
|---|---|
| 하트비트 (버퍼 비어도 전송) | **60초** |
| 콜 수집 후 | 300ms 디바운스 |
| 화면 상태 변경 | 200ms 디바운스 |
| 판결 대기 중 (`isWaitingDecision`) | **1초 고속 폴링** |

> ⚠️ KDoc과 기동 로그에 "20초"라 적힌 곳이 남아 있습니다. 실제는 60초입니다. → todo.md

### 서버 URL 결정 — `ApiClient.getTargetUrl()`
`BuildConfig`가 아니라 **SharedPreferences**가 결정합니다.

```
isLiveMode = true  → https://1dal.altari.com{endpoint}
isLiveMode = false → http://{localPcIp}{endpoint}     기본 172.30.1.89:4000
```
설정 탭의 스위치로 전환합니다. 실기기 로컬 테스트 시 **포트까지 입력**해야 합니다
(UI 기본값에 포트가 빠져 있어 그대로 두면 80포트로 붙으려다 실패합니다).

---

## 4. 빌드 버전 식별 (이슈 V)

폰에 어떤 APK가 깔려 있는지 확인할 수단이 필요합니다. 앱 대시보드 상단과 기동 로그에 표시됩니다.

```
📦 v1.2-capacity+logdiet (build 3)
```

> ⚠️ **`BuildConfig.VERSION_NAME`을 쓰면 안 됩니다.**
> 컴파일 타임 상수라 호출부에 값이 인라인됩니다. `versionName`만 바꾸고 호출부 소스가 그대로면
> `compileDebugKotlin`이 up-to-date로 판정되어 **APK에 옛 문자열이 남습니다.**
> 실제로 DEX 안에 신·구 버전이 동시에 존재해, 화면은 1.1인데 `adb dumpsys`는 1.2인 상황이 있었습니다.
> → `core/AppInfo.kt`가 `PackageManager`로 **런타임 조회**합니다. 매니페스트를 읽으므로
> `adb dumpsys package` 결과와 항상 일치합니다.

## 5. 빌드·설치

Android Studio 내장 JDK(JBR 21)를 쓰면 별도 JDK 설치가 필요 없습니다.

```bash
cd onedal-app
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
./gradlew :app:compileDebugKotlin    # 컴파일만
./gradlew :app:assembleDebug         # APK

~/Library/Android/sdk/platform-tools/adb install -r \
  app/build/outputs/apk/debug/app-debug.apk
```

**설치 후 반드시 확인**
1. **접근성 권한** — 앱 업데이트 시 안드로이드가 자동으로 끕니다. 대시보드 배지가 🔴이면 재승인
2. **서버 모드** — 로컬 테스트면 스위치 OFF + `PC IP:4000`
3. **PIN 페어링** — `-r` 설치면 유지됩니다. 완전 삭제 후 설치하면 `deviceId`가 새로 생성되어 재페어링 필요

## 6. 확장 규칙

1. **사이드 이펙트 방지** — HTTP 코드가 터치 코드에 직접 관여하지 않습니다. `HijackService`를 경유합니다
2. **Thread-Safety** — `scrapBuffer`는 `synchronized`, 공유 플래그는 `@Volatile`
3. **새 배차앱 추가** — `plugins/` 아래에 Parser + Keywords를 만들고 `ScrapParser`의 `when`에 추가.
   단, 현재는 `HijackService`의 하드코딩 때문에 그것만으로는 부족합니다 (todo.md Phase 5)
4. **로그** — 대량 덤프는 `AppLogger.v`. release 빌드에서 자동으로 꺼집니다
