# 1DAL-WEB TRD (Technical Requirements Document)

본 문서는 `onedal-web` 프로젝트를 제로베이스에서 동일하게 복원해 낼 수 있는 백엔드 및 프론트엔드 상세 아키텍처 스펙시트입니다.

## 1. 프로젝트 폴더 구조 (Polyrepo)
```text
onedal-web/
  ├── server/             # Express 5.x + Socket.io + SQLite
  │   ├── src/index.ts    # 소켓 및 미들웨어 초기화
  │   ├── src/db.ts       # DB 연결 및 테이블 DDL 설정
  │   ├── src/routes/     # REST API 라우팅
  │   └── data.db         # 로컬 파일 기반 SQLite DB 저장소
  │
  └── client/             # Vite 6 + React 19 + Tailwind v4
      ├── vite.config.ts  # /api ➡️ localhost:4000 프록시 룰
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
- **AudioContext (알림음 합성)**: `mp3` 파일 재생 시 모바일 자동재생 정책에 막히는 것을 방지하기 위해, 순수 주파수를 합성하는 발진기(Oscillator) 패턴으로 "띠딩" 사운드를 렌더링.
- **CORS 및 프록시**: Vite 서버 포트(5173)와 Express 서버 포트(4000) 충돌을 회피하기 위해 `vite.config.ts` 에 `proxy: { '/api': 'http://localhost:4000', '/socket.io': { target: 'http://localhost:4000', ws: true } }` 추가가 필수.
