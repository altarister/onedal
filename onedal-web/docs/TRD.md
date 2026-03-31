# 1DAL-WEB TRD (Technical Requirements Document)

## 🏛 아키텍처 및 시스템 레이어
과거 Vercel 배포 한계(커스텀 서버 소켓 통신 불가)를 극복하기 위해 Next.js를 걷어내고, `Vite + React`(클라이언트)와 `Express + Socket.io`(서버)의 **폴리레포(Polyrepo)** 로 분리되었습니다.

### 1. 폴더 구조 및 데이터 흐름
```text
[A24 스캐너] ─HTTP POST─→ [Express 서버 :4000] ─Socket.io─→ [Vite 대시보드 :5173]
                            /api/orders            "new-order"    콜 카드 표시 + 🔔
```

- `client/`: 순수 React SPA (Vite 번들러). App.tsx가 글로벌 레이아웃 유지.
- `server/`: Node.js Express 앱. `index.ts`에서 HTTP와 Socket 동시 수신.

### 2. Backend (Express Server : 4000)
- **Framework**: Express 5.x
- **WebSocket**: Socket.io 4.x 연동으로 `client`에게 실시간 Push.
- **REST API 라우트**: 
  - `routes/orders.ts` (`POST /api/orders`): 스캐너의 오더 데이터 수신, SQLite 적재, 소켓 Emit 수행.
  - `routes/intel.ts` (`POST /api/intel`): 탈락한 오더들의 히스토리(빅데이터) 수집.
- **Database**: `better-sqlite3` (`server/data.db`). 시스템 종료/재부팅 시 데이터 보존.

### 3. Frontend (Vite + Web : 5173)
- **Framework & Routing**: Vite 6, React 19, React Router 7.
- **Styling**: Tailwind CSS v4.0 (다크 모드 강제 및 고대비 테마 `index.css` 적용).
- **Network Setting**: `vite.config.ts`의 프록시 룰을 통해 `/api` 및 `/socket.io` 콜을 `localhost:4000`으로 브리지 연결.

## 🛠 배포 및 운영 전략 (예정)
1. **Frontend**: 정적 파일 빌드(`npm run build`) 후 **AWS S3 + CloudFront**를 통해 비용 0원에 가까운 CDN 배포.
2. **Backend**: WebSocket을 상시 대기해야 하므로 **AWS EC2 (t2.micro)** 서버에 데몬 프로세스 스핀업 후 무중단 서빙.
