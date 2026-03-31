# 1DAL (일달) - 콜 선점(지지기) 앱 TRD (Technical Requirements Document)

본 문서는 인성앱을 대상으로 한 퀵서비스 콜 선점 자동화 앱 **`1DAL`**의 기술적 요구사항 및 아키텍처를 정의합니다. 화면 캡처(MediaProjection)는 힌트일 뿐이며, 궁극적 목적은 **화면 내 노드 분석 및 자동 클릭(AccessibilityService)과 실시간 수익성 분석(ML/Algorithm)**을 통한 콜 선점입니다.

---

## 1. 아키텍처 및 시스템 레이어 (Architecture)

### 1.1 하이재킹 & 엔진 레이어 (Core Foundation)
- **AccessibilityService (접근성 서비스)**: 
  - 앱의 최하단에서 동작하며 타겟 앱(인성앱)의 View Hierarchy(노드)를 실시간으로 스트리밍받습니다.
  - `AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED` 이벤트를 리스닝하여 리스트 업데이트를 감지.
  - [배차], [확정] 등 특정 텍스트나 View ID를 가진 노드의 화면 좌표(Rect)를 추출하고 `performAction(AccessibilityNodeInfo.ACTION_CLICK)` 또는 `dispatchGesture`를 통해 시스템 레벨의 자동 터치(Auto-Click)를 수행합니다.
- **MediaProjection API (선택적 보완)**: 
  - AccessibilityService가 읽어내지 못하는 Custom View(캔버스 등)나 암호화된 이미지 텍스트가 있을 경우, 화면 캡처를 통해 픽셀 데이터를 확보합니다.

### 1.2 인식 및 분석 레이어 (Perception)
- **Google ML Kit (Vision OCR)**:
  - MediaProjection으로 확보한 비트맵 이미지에서 온디바이스(Off-line)로 텍스트를 초고속 추출. (비용 무료, 지연시간 최소화)
- **Regex & Parsing Engine**:
  - Accessibility 노드 또는 OCR에서 추출된 로우(Raw) 텍스트를 정규식(Regular Expression)으로 필터링하여 `상차지`, `하차지`, `운임요금` 모델 데이터 클래스로 변환.

### 1.3 알고리즘 및 판별 레이어 (Intelligence)
- **Cost Calculation (수익성 알고리즘)**: 
  - 차종(ex. BMW 5 GT) 연비 상수, 현재 경유가, 주행거리를 연산하여 **건당 예상 순수익** 도출.
- **Auto-Dispatch Logic (자동 배차 조건)**:
  - (예시) "건당 순수익 산출액 > 10,000원 AND 목적지 = '성남/광주'" 일 경우, 딜레이 없이(0.1초 내) 1.1 레이어의 `Auto-Click` 트리거.

### 1.4 오버레이 UI 레이어 (Overlay Window)
- **System Alert Window (`TYPE_APPLICATION_OVERLAY`)**:
  - 인성앱 화면 최상단에 항상 떠 있는 플로팅 UI (플로팅 버튼, 상태창).
  - 현재 일달 엔진의 구동 상태(Green: 분석/대기, Red: 자동클릭 수행 등) 및 최근 콜의 간이 수익성 수치를 띄워줌.

---

## 2. 최소 및 권장 디바이스 (Hardware & Environment)

콜을 0.1초라도 빠르게 잡기 위해서는 기기의 하드웨어 성능과 네트워크 상태가 가장 중요합니다.

- **OS 버전**: Android 11 (API 30) 이상 권장. (최신 ML Kit 및 강화된 접근성 서비스 동작 안정화 기준)
- **RAM**: 최소 6GB 이상 (8GB 이상 권장). 백그라운드에서 OCR 모델 인퍼런스와 접근성 노드 탐색이 무한 반복되므로 램 여유가 필수.
- **AP / CPU**: 스냅드래곤 8 시리즈 이상의 플래그십 기기 권장. (화면 픽셀 스캔 및 정규식 처리의 레이턴시(ms) 단축)
- **네트워크**: 5G 모바일 데이터 필수.
- **OS 튜닝 (필수사항)**:
  1. 루팅(Rooting)은 필수가 아님 (접근성 서비스만으로 자동 클릭 가능).
  2. 기기 설정에서 **"배터리 최적화 예외"** 앱으로 반드시 등록해야 엔진이 Kill되지 않음.
  3. "다른 앱 위에 표시" (System Alert Window) 권한 필수 승인.

---

## 3. 핵심 기술 스택 (Tech Stack)

- **Language**: Kotlin (메인 로직), 안드로이드 네이티브
- **Architecture Pattern**: MVVM + Service-centric Architecture
- **Asynchronous**: Kotlin Coroutines & Flow (비동기 데이터 스트림 병렬 처리. UI 노드 파싱 스레드와 클릭 수행 스레드 철저히 분리)
- **Local Database**: Room DB (SQLite 기반). 일일 배차 로그, 성공/실패율, 텍스트 파싱 히스토리 영구 저장.
- **Background Work**: `WorkManager` (하루가 끝난 뒤 수익성 데이터를 백업 및 동기화할 때 사용). `Foreground Service` (주행 중 앱 생존 보장).

---

## 4. 권한 처리 요구사항 (Permissions)

`AndroidManifest.xml`에 다음 권한 및 서비스 컴포넌트 선언이 필수적입니다.

```xml
<!-- 백그라운드 데이터 통신 -->
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />

<!-- 다른 앱 위에 플로팅 UI 띄우기 (오버레이) -->
<uses-permission android:name="android.permission.SYSTEM_ALERT_WINDOW" />

<!-- 포그라운드 서비스 및 알림 유지 -->
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />

<!-- (옵션) 화면 픽셀 기반 OCR이 필요한 경우 -->
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_MEDIA_PROJECTION" />

<!-- 핵심: 무조건 배터리 제한을 풀기 위한 권한 -->
<uses-permission android:name="android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS"/>

<application>
    <!-- 1DAL 콜 선점 핵심 엔진 (접근성 서비스) -->
    <service
        android:name=".engine.AccessibilityHijackService"
        android:permission="android.permission.BIND_ACCESSIBILITY_SERVICE"
        android:exported="false">
        <intent-filter>
            <action android:name="android.accessibilityservice.AccessibilityService" />
        </intent-filter>
        <meta-data
            android:name="android.accessibilityservice"
            android:resource="@xml/accessibility_service_config" />
    </service>
</application>
```

---

## 5. 단계별 개발/검증 플로우 (Implementation & Verification)

1. **Accessibility Node Extraction (노드 덤프 연구)**:
   - 인성앱을 켠 상태에서 `1DAL` 서비스가 화면 레이아웃 XML(노드) 트리를 콘솔 혹은 텍스트 파일로 덤프(Dump)하도록 개발. (인성앱의 요금, 목적지 TextBox의 ID 값 확보가 최우선 과제)
2. **Auto-Click Test (버튼 클릭 검증)**:
   - 특정 시간이나 더미 문구가 떴을 때, 접근성 서비스의 `performAction(ACTION_CLICK)`이 실제 터치 이벤트를 발생시키는지 테스트.
3. **Filtering Algorithm Integration (필터링 엔진 결합)**:
   - 실시간 업데이트되는 노드의 텍스트 정보가 로직 레이어를 거쳐 `True/False` (콜 잡기/버리기) 판단을 0.1초 내외로 완료하는지 테스트.
4. **Latency Optimization (초단기 튜닝)**:
   - 노드가 화면에 그려진 시점부터 클릭 이벤트 파견점까지의 소요 밀리세컨드(ms) 측정 및 최적화. 불필요한 GC(Garbage Collection) 방지.
