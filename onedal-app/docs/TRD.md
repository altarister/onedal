# 1DAL-APP TRD (Technical Requirements Document)

## 🏛 아키텍처 및 시스템 레이어
`onedal-app`은 안드로이드 OS 최하단에서 화면 변경 이벤트를 가로채는 방식(Accessibility)으로 작동합니다.

### 1. 코어 엔진 (Hijack Service)
- **AccessibilityService**: 타겟 앱(인성앱)의 뷰 트리를 스트리밍(`TYPE_WINDOW_CONTENT_CHANGED`) 받고, 이벤트를 통해 `dispatchGesture` 또는 `performAction`으로 강제 터치합니다.
- **MediaProjection API (보조 OCR)**: Accessibility로 읽히지 않는 이미지 난독화된 텍스트가 뜰 경우 화면 캡쳐를 떠서 OCR로 넘깁니다.

### 2. 인식 레이어 (Perception)
- **ML Kit OCR (On-device)**: 이미지를 텍스트로 오프라인 고속 파싱.
- **Regex Engine**: 정규식으로 지명과 금액(숫자) 데이터 파싱.

### 3. 네트워크 통신 방식
- **순수 HTTP POST**: 앱이 무거워지는 것을 방지하기 위해 Socket, WebSocket을 철저히 배제합니다.
- `OkHttp`나 `Retrofit`을 사용해, 서버(onedal-web)의 `/api/orders` 및 `/api/intel` 엔드포인트로 JSON 스트림을 그냥 비동기로 던지기만(Fire and Forget) 합니다.

## 🛠 필수 하드웨어 및 OS 권한 (Requirements)

### 1. 하드웨어
- 안드로이드 11 이상 (API 30+)
- RAM 6GB 이상 (8GB 권장), 스냅드래곤 8 시리즈 이상 (지연속도 단축)

### 2. OS 필수 권한 (AndroidManifest.xml)
- `BIND_ACCESSIBILITY_SERVICE`: 핵심 화면 추출 및 터치 권한.
- `SYSTEM_ALERT_WINDOW`: 오버레이 플로팅 UI 렌더링.
- `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`: 무한 루프로 인한 OS의 앱 강제 종료(Kill) 방지 배터리 락 해제.
- `FOREGROUND_SERVICE`: 안정적인 백그라운드 구동 보장.

## ⚙️ 기술 스택
- **Language**: Kotlin 2.x
- **Async Pattern**: Coroutines / Flow (비동기 데이터 스트림 처리)
- **Local DB**: Room (필요시 파싱 히스토리 임시 저장용)
