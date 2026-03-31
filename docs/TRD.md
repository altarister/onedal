# 1DAL 글로벌 기술 요구사항 (Global TRD)

본 문서는 `onedal-app`과 `onedal-web` 간의 통신 파이프라인 상관관계와 마스터 플로우를 정의합니다.

## 🔗 아키텍처 및 통신 파이프라인 (The Master Flow)

### 1단계: [Perception] onedal-app (Android) -> HTTP POST 전송
- `onedal-app`은 스캐닝이 성공하여 꿀콜을 선점하거나, 탈락한 콜 데이터를 모았을 때 `onedal-web/server`로 단방향 `HTTP POST /api/orders` 를 통해 데이터를 쏩니다.
- **JSON Payload (예시)**: `{"texts": ["대전 유성구", "부산 해운대", "105,000"]}`
- 무거운 WebSocket은 앱 단에서 절대 사용하지 않고 비동기(Coroutines)로 Data를 쏘고 즉시 메모리를 반환하여 레이턴시를 0.05초로 방어합니다.

### 2단계: [Intelligence] onedal-web/server (Express + Node.js)
- 수신된 JSON을 정규식 및 수익성 공식을 통해 디코딩하고 SQLite DB(`data.db`)에 누적 저장합니다.
- 카카오 API 노선 프록시 연동, 기존 경로 대비 합짐 우회율을 산출하는 두뇌(엔진) 역할을 수행합니다.

### 3단계: [Action] Server -> Client (웹소켓 Push)
- 서버단에서 `Socket.io` 채널을 가동하여 브라우저 클라이언트(`onedal-web/client`)에 `new-order` 이벤트를 즉각 Emit(푸시) 합니다.
- 클라이언트(Vite+React)는 수신 데이터를 대시보드의 큰 카드 형태로 렌더링하고, 상차지 딥링크 전화 및 카카오내비 연동을 통해 휴먼-인-더-루프(Human-in-the-loop)의 최종 배차 결정을 지원합니다.

## 🛠 필수 구현 기술 스택 (What to Build)

### 1. onedal-app (Android Native)
- **언어 및 환경**: Kotlin, Android API 30+
- **핵심 엔진**: `AccessibilityService` (노드 캡처 및 시스템 레벨 터치 발생)
- **보조 엔진**: `MediaProjection API` + `Google ML Kit` (이미지 텍스트 강제 OCR)
- **데이터 파싱**: Regex (정규식 기반 텍스트 추출)
- **네트워크**: `OkHttp` 또는 `Retrofit` (순수 HTTP POST 전송)

### 2. onedal-web (Vite + Express Polyrepo)
- **Frontend (client)**: Vite 6, React 19, Tailwind CSS v4.0
- **Backend (server)**: Express 5.x, Node.js
- **실시간 통신**: `Socket.io 4.x` (서버-클라이언트 간 무손실 양방향 통신)
- **데이터베이스**: `better-sqlite3` (서버 로컬 파일 DB 연동)

※ 상세 아키텍처 기술서는 각 파트별 문서를 참고하세요.
- **안드로이드 기술 상세**: `onedal-app/docs/TRD.md`
- **웹 서버/프론트 기술 상세**: `onedal-web/docs/TRD.md`
