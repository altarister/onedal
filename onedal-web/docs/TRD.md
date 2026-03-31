# 1DAL-WEB TRD (Technical Requirements Document)

본 문서는 `onedal-web` 프로젝트를 제로베이스에서 동일하게 복원해 낼 수 있는 백엔드 및 프론트엔드 상세 아키텍처 스펙시트입니다.

## 1. 프로젝트 폴더 구조 (Polyrepo)
```text
onedal-web/
  ├── pnpm-workspace.yaml # 패키지 워크스페이스 정의 파일
  ├── shared/             # @onedal/shared (공통 타입 패키지)
  │   └── src/index.ts    # OrderData 통합 인터페이스
  ├── server/             # Express 5.x + Socket.io + SQLite
  │   ├── src/index.ts    # 소켓 및 미들웨어 초기화
  │   ├── src/db.ts       # DB 연결 및 테이블 DDL 설정
  │   ├── src/routes/     # REST API 라우팅 (orders.ts 에 crypto 명시적 임포트)
  │   └── data.db         # 로컬 파일 기반 SQLite DB 저장소
  │
  └── client/             # Vite 6 + React 19 + Tailwind v4
      ├── vite.config.ts  # 포트 3000 및 /api ➡️ localhost:4000 프록시 룰
      └── src/
          ├── App.tsx     # 웹소켓 리스너 & Wake Lock 가동
          └── pages/      # Dashboard.tsx, Settlement.tsx
```

## 2. 데이터베이스 스키마 (SQLite)
서버 재가동 시에도 내역이 보존되어야 하므로 `better-sqlite3`를 사용해 파일 기반 DB를 가동합니다.

### Table: `orders` (합격 콜 - 대시보드 표시용)
```sql
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  origin TEXT NOT NULL,
  destination TEXT NOT NULL,
  price INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  status TEXT DEFAULT 'PENDING' -- PENDING, COMPLETED, CANCELED
);
```

### Table: `intel` (불합격 빅데이터 추적용)
```sql
CREATE TABLE IF NOT EXISTS intel (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  origin TEXT NOT NULL,
  destination TEXT NOT NULL,
  price INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

## 3. 네트워크 및 통신 API (Interface)

### 3-1. REST API (Server)
클라이언트(onedal-app 등)에서 서버로 데이터를 넣는 명세입니다.

- **`POST /api/orders`**
  - Payload: `{"origin": "강남", "destination": "수원", "price": 30000}`
  - Action: `orders` 테이블에 `INSERT`. 성공 직후 **Socket.io 로 `new-order` 이벤트 발송**.
- **`GET /api/orders`**
  - Action: 브라우저가 처음 새로고침했을 때 최근 콜 50개를 불러옴(`SELECT * FROM orders ORDER BY id DESC LIMIT 50`).

### 3-2. WebSocket Event 명세 (Socket.io)
- **Namespace**: `/`
- **Emit Event (`Server -> Client`)**: 
  - 이벤트명: `new-order`
  - Payload 객체: DB에 들어간 `{id, origin, destination, price, created_at, status}`
- **On Event (`Client -> Server`)**:
  - 이벤트명: `update-status` (정산 페이지 용도)
  - Payload: `{id: 12, status: 'COMPLETED'}`

## 4. Frontend 기술 명세 (React + Vite)
- **Wake Lock API**: `navigator.wakeLock.request('screen')`을 `useEffect` 최상단에 마운트 시켜 브라우저 슬립을 차단.
- **포트 분리 및 CORS 프록시**: 인성 시뮬레이터(5173)와의 포트 충돌을 막기 위해 `vite.config.ts` 에 `port: 3000` 명시. `proxy: { '/api': 'http://localhost:4000', '/socket.io': { target: 'http://localhost:4000', ws: true } }` 추가.

## 5. 트러블슈팅 및 복구 가이드 (How to Build)
- **공통 타입 링킹**: `pnpm install`을 통해 `server`와 `client`가 내부 모듈인 `@onedal/shared`를 `workspace:*` 버전으로 사용할 수 있도록 합니다.
- **SQLite 환경 세팅**: `better-sqlite3`는 C++ 네이티브 모듈 컴파일이 필요하므로, `pnpm install` 후 `pnpm approve-builds` 와 `pnpm rebuild better-sqlite3`를 수행하여 C++ 바인딩 오류(500)를 방지해야 합니다.
- **Node Crypto UUID**: `server/src/routes/orders.ts` 에서 `crypto.randomUUID()` 사용 시 레거시 Node 환경(v18 이하) 호환성을 위해 `import crypto from 'crypto'`를 반드시 명시합니다.
