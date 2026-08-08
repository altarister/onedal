# 🔌 1DAL 백엔드 API & Piggyback 명세서

> **문서 상태**: v3.1 — 2026-08-09 코드 재대조 후 정정  
> **SSOT 코드**: `src/routes/scrap.ts`, `src/routes/orders.ts`, `src/routes/detail.ts`, `src/socket/socketHandlers.ts`

---

## 1. REST API 명세

### 1.1 `POST /api/scrap` (하트비트 & 피기백)

앱의 `TelemetryManager`가 1초 단위로 쏘는 핵심 API.

**Request Body**: `deviceId`, `targetApp`, `screenContext`, `isHolding`, `lat`, `lng`, `ackDecisionId`, `data[]`

**Response Body (Piggyback V2)**:
- `dispatchEngineArgs` — 최신 `AutoDispatchFilter` (앱 스캐너 제어용)
- `decision` — `{ orderId, action: "KEEP"|"CANCEL" }` (관제탑 결재 탑재)
- `deviceControl.mode` — `"AUTO"|"MANUAL"` (기기 모드)

> [!NOTE]
> Piggyback 응답의 정확한 필드 구조는 [scrap.ts L146-157](file:///Users/seungwookkim/reps/onedal/onedal-web/server/src/routes/scrap.ts#L146-L157) 참조.

### 1.2 `POST /api/orders/confirm` (1차 선빵 BASIC)

앱이 리스트에서 콜을 광클하고 서버에 가확정을 알리는 API.  
즉시 `200 OK` 응답하여 앱이 상세 페이지 스크래핑으로 진입하게 함.

> 코드: [orders.ts L113-192](file:///Users/seungwookkim/reps/onedal/onedal-web/server/src/routes/orders.ts#L113-L192)

### 1.3 `POST /api/orders/detail` (2차 상세 DETAILED)

상세 팝업(출발지/도착지/적요) 스크래핑 완료 후 전송.  
서버는 `202 Accepted` 반환 후 비동기로 카카오 연산 진행.

> 코드: [detail.ts L17-197](file:///Users/seungwookkim/reps/onedal/onedal-web/server/src/routes/detail.ts#L17-L197)

### 1.4 `POST /api/orders/decision` (앱 직통 결재)

앱이 서버를 거쳐 직접 KEEP/CANCEL을 전달하는 REST 엔드포인트.
⚠️ 현재 **앱에서 호출하지 않습니다.** (`ApiClient.sendDecision()`은 2026-08-09 Phase 0에서 제거)
판결은 전부 `/api/scrap` 응답 피기백으로 전달됩니다.

### 1.5 삭제된 엔드포인트

- ~~`POST /api/orders`~~ — 1세대 파이프라인. 무인증 + `userId` 없이 INSERT + `io.emit` 전역 방송.
  소비처 0건 확인 후 2026-08-09 Phase 0에서 제거. `new-order` 소켓 이벤트도 함께 사라졌습니다.

> 코드: [orders.ts L194-221](file:///Users/seungwookkim/reps/onedal/onedal-web/server/src/routes/orders.ts#L194-L221)

---

## 2. WebSocket 이벤트 명세 (Socket.IO)

### 2.1 Server → 관제탑 (Push 이벤트)

| 이벤트명 | 설명 |
|----------|------|
| `order-evaluating` | 앱이 콜을 가확정함 → 관제탑에 "처리 중" 배지 점등 |
| `order-detail-received` | 2차 상세 텍스트 도착 → 상하차지/적요 선출력 |
| `order-evaluated` | 카카오 연산+요율 판정 완료 → 꿀/똥 라벨 + KEEP/CANCEL 버튼 활성화 |
| `order-confirmed` | KEEP 확정 → 합짐 모드 UI 격상 |
| `order-canceled` | 취소/방출/타임아웃 → 카드 삭제 |
| `filter-init` | 소켓 최초 접속 시 `activeFilter` + `baseFilter` 전달 |
| `filter-updated` | 필터 변경 시 관제탑 UI 동기화 |
| `deathvalley-warning` | 데스밸리 경고. **30초** (`WAITING_WARNING_MS=30000`) — v3.0의 "15초"는 오기 |
| `sync-active-orders` | **1초 주기 하트비트**로 활성 오더 전체 배열 전송 (재시작 복구 시에도 발송) |
| `telemetry-devices` | 기기 목록 + 활성 상태 (1초 주기) |
| `telemetry-ping` | 프론트엔드 타임아웃 진행바용 핑 |
| `session-restored` | 서버 재시작 후 진행 중 콜 복구 알림 `{ restoredCount, dispatchPhase, orderIds }` |
| `emergency-alert` | 앱폰 비상 보고 전달 |
| `settings-updated` | 설정 변경 실시간 동기화 |
| `device-paired` | PIN 페어링 성공 `{ deviceId, deviceName }` |
| `home-return-ack` / `home-return-error` | 귀가콜 생성 결과 |
| `decision-ack` / `recalculate-route-ack` / `two-track-ack` | ⚠️ 서버는 emit하지만 **클라이언트에 리스너가 없음** |

### 2.2 관제탑 → Server (Control 이벤트)

| 이벤트명 | 설명 |
|----------|------|
| `decision` | KEEP/CANCEL 판결 하달 |
| `recalculate-route` | 경로 재탐색 (추천/최단/무료 옵션) |
| `update-filter` | 필터 값 변경 |
| `update-my-location` | 관제탑 GPS 위치 전달 |
| `dashboard-gps-update` | Master GPS 수신 (자동 회랑 트림용) |
| `dispatch-complete` | 운행 완료 처리 |
| `start-two-track` | 투-트랙 사냥 모드 전환 |
| `create-home-return` | 귀가콜 가상 오더 생성 |
| `request-filter-init` | 필터 재동기화 요청 |

> 소켓 핸들러 전체 코드: [socketHandlers.ts](file:///Users/seungwookkim/reps/onedal/onedal-web/server/src/socket/socketHandlers.ts)

---

## 3. 관제탑 대시보드 API

| 경로 | 용도 |
|------|------|
| `GET/POST /api/settings/*` | 차량/라우팅/집주소 등 개인 설정 CRUD |
| `GET/POST /api/settings/pricing` | 요율 엔진 설정 (차종별 단가, 수수료율) |
| `GET/POST /api/devices/*` | 기기 등록/해제/PIN 연동 |
| `GET/PUT /api/filters/*` | 블랙리스트/제외 키워드 관리 |
| `GET /api/logbook/analytics/*` | 운행 일지 통계 (일별 매출/거리) |
| `GET /api/logbook/places/*` | 자주 가는 거래처 Top N |
| `* /api/kakao/*` | 프론트엔드용 카카오 API CORS 프록시 |
| `POST /api/auth/google` | Google OAuth 로그인 |
| `POST /api/auth/refresh` · `/logout` · `/me` | 토큰 갱신 · 로그아웃 · 내 정보 |
| `POST /api/auth/bypass` | ⚠️ **개발용 우회 로그인. 인증·환경 가드 없음** — DB 첫 유저 권한으로 30일 토큰 발급. todo.md Phase 1(A)에서 게이트 예정 |
| `POST /api/emergency` | 앱폰 비상 보고 |
| **`GET /api/health`** | ⭐ 서버 정체 확인 — 부팅 시각, 업타임, git 커밋/브랜치, NODE_ENV, DB 파일. 인증 불필요 |
| `GET /api/scrap` | ⚠️ **무인증 + `WHERE user_id` 없음 → 전 기사 콜 500건 노출.** 소비처 0건 확인됨. todo.md Phase 1(C-1)에서 삭제 예정 |
