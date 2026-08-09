# 1DAL 글로벌 기술 요구사항 (Global TRD)

본 문서는 `onedal-app`과 `onedal-web` 간의 통신 파이프라인 상관관계와 마스터 플로우를 정의합니다.

## 🔗 아키텍처 및 통신 파이프라인 (The Master Flow)

### 1단계: [Perception] onedal-app (Android) -> HTTP POST 전송
- `onedal-app`은 스캐닝 및 휴리스틱(Fuzzy) 파싱을 완료한 데이터를 `onedal-web/server`로 단방향 `HTTP POST /api/orders` 로 전송(ClearText/UTF-8 Json).
- **JSON Payload (예시)**: `{"pickup": "고산동", "dropoff": "LG로지스", "fare": 143000, "rawText": "고양퀵서비스...", "type": "NEW_ORDER"}`
- 무거운 WebSocket은 앱 단에서 절대 사용하지 않고 비동기(Coroutines)와 `Gson`으로 Data를 쏘고 즉시 메모리를 반환하여 레이턴시를 0.05초로 방어.

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

### 2. onedal-web (Vite + Express Polyrepo feat. PNPM Workspaces)
- **Frontend (client)**: Vite 6 (port: 3000), React 19, Tailwind CSS v4.0
- **Backend (server)**: Express 5.x, Node.js (port: 4000)
- **Shared (@onedal/shared)**: 타입스크립트 기반 공통 DTO 규격 (`OrderData`)
- **실시간 통신**: `Socket.io 4.x` (서버-클라이언트 간 무손실 양방향 통신)
- **데이터베이스**: `better-sqlite3` (서버 로컬 파일 DB 연동)

※ 상세 아키텍처 기술서는 각 파트별 문서를 참고하세요.
- **안드로이드 기술 상세**: `onedal-app/docs/TRD.md`
- **웹 서버/프론트 기술 상세**: `onedal-web/docs/TRD.md`

## 🧠 심화 알고리즘 및 트러블슈팅 엔진 (Error Mitigation)

### 1. View Tree 터치 레이스 컨디션 (Race Condition) 방어 로직
- **이슈**: Android `AccessibilityService` 기반 노드 스크래핑 시 팝업창 렌더링/닫힘 애니메이션과 봇 터치 이벤트의 미세한 간격 오류(`터치 무시 현상`).
- **아키텍처 대응**: `PICKUP_DONE` 상태 진입 시, DOM(Node Tree) 상에 이전 팝업의 잔상 픽셀("출발지 상세" 텍스트 등)이 남아있으면 상태 전이를 일시 중단(Return)하고 화면이 완전히 클리어될 때까지 터치를 유보하는 지능적 Sync-Wait 로직 체택.

### 2. 서버-사이드 스마트 멀티라인 텍스트 파서 (Multiline Text Extraction)
- **이슈**: 안드로이드에서 긁어온 텍스트가 Label("고객", "위치")과 Value(실제 값) 줄바꿈 문자(`\n`)로 이격되어 넘어와 값 검출(Regex) 빈 문자열(`""`) 도출 됨.
- **아키텍처 대응**: `utils/parser.ts` 내에서 특정 키워드(Label) 검색 후 반환된 값이 비어있을 시 자동 배열 검출 `index + 1` 위치의 다음 개행 문자열로 우회하여 실제 Value를 100% 분리해내는 보정 컴포넌트 탑재.

### 3. 카카오 로컬 API 3중 폴백(Fallback) 방어 아키텍처
- **이슈**: 추출된 정밀 주소가 `경기 화성시 반송동(동탄로 123) KGIT센터` 처럼 다중 주소 체계와 빌딩 명이 결합되면 카카오 서버에서 `400`에러 또는 결과 없음(null) 반환.
- **아키텍처 대응**:
  1. `1차 필터`: 정규식 `/\(.*?\)/g` 기법을 통해 괄호 안의 불용어(도로명) 제거 -> 카카오 `address.json` 요청.
  2. `2차 필터`: 1차 실패 시 장소 명 기반 `keyword.json` 쿼리 요청 (장소 우선 매칭 시도).
  3. `3차 필터`: 2차 실패 시 (건물명 쓰레기값 존재로 판별), 띄어쓰기 기준 `최초 4어절(도/시/구/동/번지)`만 잘라 강력하게 `address.json`을 강제 구동.
- **선행조건**: 카카오 디벨로퍼 콘솔 상에서 `[카카오맵]` 서비스 강제 활성화 필수.

### 4. 카카오 모빌리티 다중 경유지(30 Waypoints) 무제한 우회 연산 및 ETA 보정 아키텍처
- **이슈**: 기존 `GET /v1/directions` API는 3개 경유지 제한으로 인해 합짐(3콜 이상 병합) 시 경로 유실 및 0.0km 표기 오류가 발생함. 또한 카카오 네비 엔진이 중복된 인접 하차지(예: 연달아 있는 파주시 물류센터들)를 1개의 도착지로 압축 반환하면서 프론트엔드의 ETA(도착 예정 시간) 렌더링 배열 구조가 붕괴되는 현상 발견.
- **아키텍처 대응**:
  1. `다중 경유지 POST 전환`: 백엔드 `kakaoUtil.ts` 경로 탐색 엔진을 최대 30개 경유지를 감당하는 `POST /v1/waypoints/directions`로 전면 교체하여 서버 부하 없이 무제한 병합 연산 지원.
  2. `ETA 리플리케이션(Replication) 방어`: API가 노드를 압축하여 반올림 반환하더라도, 이전 거점의 최후 ETA를 배열 끝까지 Fallback 복사하는 로직을 추가하여 앱 UI 붕괴 완벽 차단.
  3. `위상 정렬(Topological Sort) UI 렌더링`: 서버의 강력한 TSP(외판원 알고리즘) 노드가 반환한 실제 주행 순서 인덱스(`visitOrderMap`)를 콜 리스트에 동적으로 매핑. 접수된 시간순이 아닌 오직 "실제 상차 방문 순서" 기준으로 대시보드 리스트가 완벽하게 수직 정렬되도록 패치.
