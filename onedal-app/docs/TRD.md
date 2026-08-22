# 1DAL-APP TRD (Technical Requirements Document)

본 문서는 `onedal-app`을 처음부터 스크래치로 개발할 수 있을 수준의 상세한 아키텍처와 구현 명세서를 제공합니다.

> ## ⚠️ 이 문서는 **초기 설계안**이다 — 코드와 대조된 적이 없다
>
> `onedal-app/CLAUDE.md` 의 *"신뢰할 수 있는 문서"* 목록에 **이 문서는 없다.**
> 2026-08-23 에 §0 을 쓰면서 대조한 범위만 아래에 적는다. **나머지는 여전히 미검증이다.**
>
> | 이 문서가 적은 것 | 2026-08-23 코드 | |
> |---|---|---|
> | `MainForegroundService` 가 앱을 살려 둔다 (§1-2) | **그런 파일이 없다.** manifest 에도 없다 | ❌ |
> | Retrofit & Coroutines (§1-3) | `HttpURLConnection` (`api/ApiClient.kt`) | ❌ |
> | `SYSTEM_ALERT_WINDOW` 권한 (§2) | manifest 에 없다 (`INTERNET`·`REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` 둘뿐) | ❌ |
> | `AccessibilityService` 로 화면을 읽고 `dispatchGesture` 로 누른다 (§1-1) | 일치 | ✅ |
> | §0 생명주기 | **코드에서 확인하고 새로 쓴 것** | ✅ |
>
> 🔴 **§1-2 는 특히 위험하다.** *"포그라운드 서비스가 앱을 살려 둔다"* 고 읽으면
> 실제 전원 스위치(**접근성 토글**)가 아닌 곳을 보게 된다. 실제 동작은 §0 에 있다.

---

## 0. 생명주기 — 무엇이 켜고 무엇이 끄는가 ⚠️ 먼저 읽을 것

기사님(2026-08-23): *"앱에서 지금 원달앱을 실행하지 않았거든? **근데 어떻게 작동하고
있는 거지?** 이해를 못하겠어."*

### 폰 안에 두 개가 **따로** 산다

| | 원달앱 화면 | 스캐너 |
|---|---|---|
| 코드 | `MainActivity` | `HijackService` (`AccessibilityService`) |
| 누가 띄우나 | **사람이 아이콘을 눌러서** | **안드로이드가** — 접근성 토글이 켜져 있으면 |
| 하는 일 | 설정 보기 · 버전 확인 | 화면 읽기 · 필터 · 자동 터치 · 서버 통신 |
| 안 띄우면 | 아무 일도 안 생긴다 | — |

`AndroidManifest.xml` 에 둘이 **나란히** 선언돼 있고, 사이에 의존이 **없다.**
`MainActivity` 는 런처 아이콘이고, `HijackService` 는 `android.accessibilityservice.AccessibilityService`
액션으로 **OS 가 직접 바인딩**하는 물건이다.

```
접근성 토글 ON  ─▶  OS 가 HijackService 를 바인딩  ─▶  onServiceConnected()
                                                       ├ ApiClient / TelemetryManager / ScrapParser 생성
                                                       ├ telemetryManager.start()   ← 하트비트 시작
                                                       ├ apiClient.fetchKeywords()
                                                       └ updateScreenContext(LIST)
```

→ **아이콘은 한 번도 안 눌러도 스캐너가 돈다.** (`HijackService.kt` `onServiceConnected()`)

### 이건 결함이 아니라 이 제품의 전제다

운행 중 폰에는 **배차망 화면**이 떠 있어야 한다. 원달앱 화면을 띄워 둬야만 동작했다면
이 제품은 애초에 성립하지 않는다. *"안 보이는데 돌고 있다"* 가 정상이다.

### 그래서 무엇이 진짜 끄나

| 하면 | 스캐너가 | 왜 |
|---|---|---|
| 최근앱에서 원달앱을 밀어 없앰 | **안 꺼진다** | 민 것은 `MainActivity` 다. 서비스는 OS 가 들고 있다 |
| 폰 재부팅 | **다시 켜진다** | 접근성 서비스는 재부팅을 넘어 살아남는다 (`BOOT_COMPLETED` 리시버가 **필요 없다** — manifest 에 없는 것이 맞다) |
| `adb install -r` 재설치 | 대체로 **유지된다** | |
| **접근성 토글 OFF** | 꺼진다 | ← **진짜 전원 스위치** |
| 설정 → 앱 → **강제 중지** | 꺼진다 | |
| 배터리 최적화가 잡아감 | 꺼진다 | 그래서 `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` 를 받아 둔다 |

🔴 **관제웹의 녹색은 "앱 화면이 떠 있다"가 아니라 "하트비트가 온다"를 뜻한다.**
조용할 때 60초, 결재 대기 중엔 1초 간격이고(`TelemetryManager` 의 `HEARTBEAT_INTERVAL_MS`·
`FAST_POLLING_MS`), 서버는 약 70초 무응답이면 `OFFLINE` 으로 내린다.

> 2026-08-23 에 *"앱을 죽였는데 관제웹이 계속 녹색이다 — 딜레이인가?"* 를 조사했다.
> **딜레이가 아니었다.** 서비스가 진짜로 살아서 하트비트를 보내고 있었고, 화면은 정확했다.
> 앱 화면과 스캐너를 한 몸으로 여기면 **멀쩡한 화면을 버그로 읽는다.**

---

## 1. 아키텍처 컴포넌트

### 1-1. HijackAccessibilityService (접근성 서비스)
- **상속**: `android.accessibilityservice.AccessibilityService`
- **이벤트 수신**: `onAccessibilityEvent(event: AccessibilityEvent)`
- **동작 방식**:
  - `event.eventType == TYPE_WINDOW_CONTENT_CHANGED` 일 때 트리거.
  - 타겟 패키지(`com.insung.app` 등)인지 검증.
  - 리스트 아이템 내부에서 무작위 순서로 떨어지는 텍스트 파편들을 수집 (ex: `"요금"`, `"/ "`, `"@"`)하여 **휴리스틱(Fuzzy) 파서**로 핵심 필드(상차지, 하차지, 운임)만 추출.
  - 1차 검증 (e.g. `fare > 0`) 후 서버와 통신하며, 합격 노드 발견 시 `node.getBoundsInScreen(rect)`로 좌표 획득 후 `dispatchGesture()`를 사용해 강제 클릭.

### 1-2. ~~MainForegroundService (백그라운드 지속 보장)~~ ❌ **만들지 않았다**

> 🔴 **이 컴포넌트는 코드에 없다** (2026-08-23 확인 — `app/src/main/` 전체에
> `MainForegroundService`·`startForeground` 가 하나도 없고, manifest 에도 없다).
>
> **만들 필요가 없어서 안 만든 것이다.** 접근성 서비스는 OS 가 직접 붙잡고 있어서
> 상단바 알림으로 붙들어 둘 대상이 아니다. 지속성은 **접근성 토글 + 배터리 최적화 제외**로
> 확보한다 → **§0** 을 볼 것.
>
> 이 절을 읽고 *"포그라운드 서비스가 살려 준다"* 고 배우면 실제 전원 스위치를 못 찾는다.
> 지우지 않고 남겨 두는 이유는, 이 문서에 **계획을 완료로 적은 자국**을 지워 버리면
> 같은 실수가 다시 태어나기 때문이다.

<details><summary>원래 적혀 있던 내용 (사실 아님)</summary>

- **상속**: `android.app.Service`
- **역할**: 접근성 서비스와 별개로, 앱이 시스템 메모리 정리 시 날아가지 않도록 **[1DAL 스캐너 가동 중]** 이라는 Notification을 상단 바에 고정시킵니다.
- 통신기능 듀티사이클 워커(Worker) 스케줄링 관리.

</details>

### 1-3. Network Layer (Retrofit & Coroutines)
- **비동기 처리**: 파싱된 데이터 전송 시 메인 UI 스레드 멈춤(Freze)을 방지하기 위해 `Dispatchers.IO` 환경에서 Retrofit 발송.
- **REST API 명세**:
  - `POST [Web_URL]:4000/api/orders` : 합격(선점) 콜 발생 시 즉시 전송
    ```json
    {
      "type": "NEW_ORDER",
      "pickup": "강남역삼",
      "dropoff": "LG로지스",
      "fare": 133000,
      "rawText": "고양퀵서비스... [앱 원본 파편 텍스트 전체]",
      "timestamp": "2026-03-31T21:40:00Z"
    }
    ```
  - `POST [Web_URL]:4000/api/scrap` : 불합격 콜 10개씩 Bulk 전송
    ```json
    {
       "type": "SCRAP_BULK",
       "data": [
         {"origin": "수원", "dest": "파주", "price": 10000}, ...
       ]
    }
    ```

## 2. 필수 앱 설정 (Manifest & Service Config)

### `AndroidManifest.xml`
```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.SYSTEM_ALERT_WINDOW" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS" />

<application android:usesCleartextTraffic="true"> <!-- 로컬 HTTP 전송 허용 -->
</application>

<service
    android:name=".services.HijackAccessibilityService"
    android:permission="android.permission.BIND_ACCESSIBILITY_SERVICE"
    android:exported="true">
    <intent-filter>
        <action android:name="android.accessibilityservice.AccessibilityService" />
    </intent-filter>
    <meta-data
        android:name="android.accessibilityservice"
        android:resource="@xml/accessibility_service_config" />
</service>
```

### `res/xml/accessibility_service_config.xml`
```xml
<accessibility-service xmlns:android="http://schemas.android.com/apk/res/android"
    android:accessibilityEventTypes="typeWindowContentChanged"
    android:packageNames="인성앱패키지명"
    android:accessibilityFeedbackType="feedbackGeneric"
    android:notificationTimeout="50"
    android:canRetrieveWindowContent="true"
    android:canPerformGestures="true" />
```

## 3. 핵심 알고리즘 메커니즘

### 중복 콜 필터링 (LRU Cache 활용)
인성앱 리스트는 스크롤 할 때마다 같은 이벤트가 수십 번 떨어집니다.
- **메커니즘**: 파싱된 `상차지+하차지+요금` 문자열을 해시(Hash)화하여 사이즈가 500개인 메모리 맵(LRU Cache)에 담습니다.
- **검증**: `if (!cache.contains(hash))` 일 때만 서버 전송 및 클릭 로직을 수행합니다. 이를 통해 네트워크 폭탄과 미친듯한 중복 클릭을 방어합니다.

## 4. 라이브러리 (Dependencies)
```gradle
dependencies {
    // 네트워크 통신 및 JSON 시리얼라이저 (필수!)
    implementation("com.google.code.gson:gson:2.10.1")
    implementation("com.squareup.retrofit2:retrofit:2.9.0")
    implementation("com.squareup.retrofit2:converter-gson:2.9.0")
    // 코루틴
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.7.3")
}
```
