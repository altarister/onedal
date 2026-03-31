# 1DAL 글로벌 기술 요구사항 (Global TRD)

본 문서는 `onedal-app`과 `onedal-web` 간의 통신 기술 요건 및 전체적인 통신 파이프라인 상관관계를 정의합니다. 상세 기술 요구사항은 각 폴더 내부 문서를 참고하세요.

## 🔗 통신 파이프라인 (Tech Data Flow)

### 1단계: App -> Web (단방향 HTTP POST)
- `onedal-app`은 스캐닝이 성공하여 꿀콜을 선점했을 때, 해당 콜의 데이터를 `onedal-web/server`로 `HTTP POST /api/orders` 를 통해 쏩니다.
- **JSON Payload (예시)**: `{"texts": ["대전 유성구", "부산 해운대", "105,000"]}`
- 무거운 WebSocket은 앱 단에서 절대 사용하지 않고 비동기(Coroutines)로 Data를 쏘고 즉시 메모리를 반환하여 레이턴시를 0.05초 방어합니다.

### 2단계: Server 프로세스 (Node.js)
- 수신된 JSON을 정규식 및 수익성 공식을 통해 디코딩합니다.
- 카카오 API 노선 프록시 연동, 기존 경로 대비 합짐 우회율을 산출합니다.
- 합격된 경우 SQLite DB(`data.db`)에 영구 저장합니다.

### 3단계: Server -> Client (웹소켓 Push)
- 서버단에서만 `Socket.io` 채널을 가동하여 브라우저 클라이언트(`onedal-web/client`)에 `new-order` 이벤트를 즉각 Emit(푸시) 합니다.

## 📁 각 문서 매핑 가이드
- **안드로이드 기술 상세**: `onedal-app/docs/TRD.md`
- **웹 서버/프론트 기술 상세**: `onedal-web/docs/TRD.md`
