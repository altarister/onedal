# 1DAL-APP TRD (Technical Requirements Document)

본 문서는 `onedal-app`을 처음부터 스크래치로 개발할 수 있을 수준의 상세한 아키텍처와 구현 명세서를 제공합니다.

## 1. 아키텍처 컴포넌트

### 1-1. HijackAccessibilityService (접근성 서비스)
- **상속**: `android.accessibilityservice.AccessibilityService`
- **이벤트 수신**: `onAccessibilityEvent(event: AccessibilityEvent)`
- **동작 방식**:
  - `event.eventType == TYPE_WINDOW_CONTENT_CHANGED` 일 때 트리거.
  - 타겟 패키지(`com.insung.app` 등)인지 검증.
  - `rootInActiveWindow` 노드부터 BFS/DFS로 순회하며 정규식(Regex)을 돌려 원하는 데이터를 파싱.
  - 합격 노드 발견 시 `node.getBoundsInScreen(rect)`로 좌표 획득 후 `dispatchGesture()`를 사용해 강제 클릭.

### 1-2. MainForegroundService (백그라운드 지속 보장)
- **상속**: `android.app.Service`
- **역할**: 접근성 서비스와 별개로, 앱이 시스템 메모리 정리 시 날아가지 않도록 **[1DAL 스캐너 가동 중]** 이라는 Notification을 상단 바에 고정시킵니다.
- 통신기능 듀티사이클 워커(Worker) 스케줄링 관리.

### 1-3. Network Layer (Retrofit & Coroutines)
- **비동기 처리**: 파싱된 데이터 전송 시 메인 UI 스레드 멈춤(Freze)을 방지하기 위해 `Dispatchers.IO` 환경에서 Retrofit 발송.
- **REST API 명세**:
  - `POST [Web_URL]:4000/api/orders` : 합격(선점) 콜 발생 시 즉시 전송
    ```json
    {
      "type": "NEW_ORDER",
      "origin": "경기 광주",
      "destination": "강남구 역삼동",
      "price": 45000,
      "timestamp": "2026-03-31T21:40:00Z"
    }
    ```
  - `POST [Web_URL]:4000/api/intel` : 불합격 콜 10개씩 Bulk 전송
    ```json
    {
       "type": "INTEL_BULK",
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
    // 네트워크
    implementation("com.squareup.retrofit2:retrofit:2.9.0")
    implementation("com.squareup.retrofit2:converter-gson:2.9.0")
    // 코루틴
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.7.3")
    // (옵션) ML Kit OCR
    implementation("com.google.mlkit:text-recognition:16.0.0")
}
```
