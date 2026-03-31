# 1DAL-WEB TRD (Technical Requirements Document)

## 🏛 아키텍처 및 시스템 레이어
`onedal-web` 프로젝트는 `Vite + React`(클라이언트)와 `Express + Socket.io`(서버) 구조로 완전히 분리되어 각각 독립적으로 동작합니다.

### 1. Backend (Express Server : 4000)
- **Framework**: Express 5.x 기반.
- **WebSocket**: Socket.io 4.x 연동으로 `client`에게 실시간 Push (`new-order` 이벤트 발송).
- **REST API (`/api/orders`, `/api/intel`)**: 
  - `onedal-app` 스캐너 폰에서 HTTP POST로 전송하는 데이터를 JSON 파싱하여 수신.
  - 수신 즉시 Socket.io 파이프라인으로 뿌려주고 SQLite에 누적 저장.
- **Database**: `better-sqlite3` (서버 재시작 후에도 이전 콜 기록 보존). MVP 단계를 넘어가면 클라우드(Supabase/Vercel KV)로 전환.

### 2. Frontend (Vite + React : 5173)
- **Framework**: Vite 6, React 19, React Router 7.
- **Styling**: Tailwind CSS v4.0 (운전 중 시인성이 극대화된 다크 모드, 고대비 폰트 적용).
- **Network**: `socket.io-client`로 4000번 포트 서버와 무중단 웹소켓 통신. 서버 프록시 설정 (`vite.config.ts`) 적용 완료.
- **Browser API**: `navigator.wakeLock.request('screen')`을 통해 화면 수면 방지. Web Audio API를 사용한 시스템 알림음 `AudioContext` 발진기(Oscillator) 합성.

## 🛠 배포 및 운영 전략
1. **Frontend**: 정적 파일 빌드 후 **AWS S3 + CloudFront** 혹은 **Vercel** 무상 웹 호스팅 엣지 배포.
2. **Backend**: 24시간 백그라운드로 소켓을 대기해야 하므로 서버리스(Vercel Functions)가 불가능. 따라서 **AWS EC2 (t2.micro)** 서버 등에 Node.js 데몬을 띄워 상시 구동 (비용 최소화).
