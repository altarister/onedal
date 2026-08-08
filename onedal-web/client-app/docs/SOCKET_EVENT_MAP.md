# 📡 1DAL 관제웹 — Socket Event Map

> **문서 상태**: v2 — 2026-08-09 코드 재대조 후 정정  
> **작성일**: 2026-05-05 / 개정 2026-08-09  
> **목적**: 클라이언트가 소켓으로 주고받는 모든 이벤트를 한 눈에 파악합니다. 서버 `API_SPEC.md`와 쌍을 이룹니다.

---

## 1. 연결 라이프사이클

```
[브라우저 탭 오픈]
  │
  ├── lib/socket.ts: io() 싱글톤 생성
  │   └── auth: localStorage의 access_token을 JWT로 전달
  │
  ├── "connect" 이벤트 수신
  │   └── useOrderEngine: isConnected = true
  │   └── useFilterConfig: socket.emit("request-filter-init")
  │
  ├── "disconnect" 이벤트 수신
  │   └── useOrderEngine: isConnected = false
  │
  └── [로그아웃 시] socket.disconnect()
      [재로그인 시] socket.disconnect() → socket.connect()
```

---

## 2. 구독(Listen) 이벤트

### 오더 라이프사이클 (`useOrderEngine.ts`)

| 이벤트명 | Payload | 설명 | 소리 |
|---------|---------|------|------|
| ~~`new-order`~~ | — | **제거됨(2026-08-09)**. 유일한 발신처였던 레거시 `POST /api/orders`가 삭제되어 리스너도 함께 제거 | — |
| `order-evaluating` | **`PendingOrder` 전체 객체** | 앱이 콜을 가확정 → 관제탑에 카드 생성 | 🔊 `playBeep()` |
| `order-detail-received` | `PendingOrder` | 앱폰이 상세 페이지 파싱 완료 → 서버가 상세 정보 전달 | - |
| `order-evaluated` | `SecuredOrder` | 서버의 카카오/OSRM 경로 연산 완료 (kakaoTimeExt 포함) | 🔊 `playBeep()` |
| `order-confirmed` | `string (orderId)` | 관제탑(사용자)이 KEEP 결정 → 서버가 확정 처리 | - |
| `order-canceled` | **`{ id, status, isManual }`** | 거절/방출/강제취소. `isManual=true`면 삭제하지 않고 상태만 바꿔 '취소/방출' 탭에 남긴다 | - |
| `sync-active-orders` | `SecuredOrder[]` | **1초 주기**로 활성 오더 전체 배열 전송. 소켓 이벤트 유실 자동 치유용 | - |
| `session-restored` | `{ restoredCount, dispatchPhase, orderIds }` | 서버 재시작 후 진행 중 콜 복구 알림 → Dashboard 상단 배너 | - |

### 필터 동기화 (`useFilterConfig.ts`)

| 이벤트명 | Payload | 설명 |
|---------|---------|------|
| `filter-init` | `{ activeFilter, baseFilter }` | 최초 연결 시 서버의 현재 필터 상태 수신 |
| `filter-updated` | `{ activeFilter, baseFilter }` | 필터 변경 후 서버가 확인 응답 |

### 기기 텔레메트리 (`useDevices.ts`)

| 이벤트명 | Payload | 설명 |
|---------|---------|------|
| `telemetry-devices` | `DeviceSession[]` | 1초마다 전체 기기 상태 브로드캐스트 |
| `telemetry-ping` | `{ orderId }` | 개별 오더의 데이터 수집 진행 핑 (30초 카운터용) |

### 안전/경고 (`useSystemAlerts.ts`)

| 이벤트명 | Payload | 설명 | 소리 |
|---------|---------|------|------|
| `emergency-alert` | `EmergencyAlert` | 앱폰 비상 보고 (취소불가 팝업 등) | 🚨 `playEmergencyAlarm()` |
| `deathvalley-warning` | `DeathValleyWarning` | 30초 경과 경고 (`WAITING_WARNING_MS`) | - |

### ⚠️ 서버가 emit하지만 클라 리스너가 없는 이벤트
`decision-ack` · `recalculate-route-ack` · `two-track-ack` — 응답을 보내지만 아무도 받지 않습니다.

### 기기 관리 (`SettingsModal.tsx`)

| 이벤트명 | Payload | 설명 |
|---------|---------|------|
| `device-paired` | **`{ deviceId, deviceName }`** | PIN 입력 완료 → 기기 목록 새로고침 |
| `settings-updated` | 설정 객체 | 설정 변경 시 실시간 동기화 |

### 기타 (`OrderFilterModal.tsx`, `Dashboard.tsx`)

| 이벤트명 | Payload | 설명 |
|---------|---------|------|
| `home-return-ack` | `{ orderId }` | 귀가콜 생성 성공 응답 |
| `home-return-error` | `{ error }` | 귀가콜 생성 실패 응답 |
| `auto-arrived` | `{ message }` | ⚠️ **미구현.** 클라 리스너는 있으나 **서버에 emit이 0건**. `geoService`의 도착 감지 자체가 죽어 있음(todo.md Phase 4) |

---

## 3. 발행(Emit) 이벤트

| 이벤트명 | Payload | 트리거 위치 | 설명 |
|---------|---------|------------|------|
| `request-filter-init` | (없음) | `useFilterConfig` (연결/마운트 시) | 서버에 현재 필터 상태 요청 |
| `update-filter` | `Partial<AutoDispatchFilter>` | `useFilterConfig.updateFilter()` | 필터 설정 변경 전송 |
| `decision` | `{ orderId, action }` | `useOrderEngine.handleDecision()` | 오더 결재 (KEEP/CANCEL/RELEASE/FORCE_CANCEL) |
| `recalculate-route` | `{ orderId, priority }` | `useOrderEngine.handleRecalculate()` | 경로 재탐색 (추천/시간/거리) |
| `dispatch-complete` | `{ orderId }` | `PinnedRouteCard` 완료 버튼 | 운행 완료 처리 |
| `dashboard-gps-update` | `{ lat, lng, accuracy?, timestamp? }` | ⚠️ **발신처 2곳** — `useGpsTelemetry`(50m/10s 스로틀, App 전역) + `useMasterGps`(스로틀 없음, PinnedRoute). 중복 발신 상태. todo.md Phase 3(L) |
| `create-home-return` | **`{ corridorRadiusKm?, destinationRadiusKm? }`** | `OrderFilterModal` 귀가콜 버튼 | 집 주소는 서버가 `user_settings`에서 읽는다 |
| `start-two-track` | (없음) | `OrderFilterModal` 투트랙 버튼 | 투트랙 모드 시작 |

---

## 4. 소켓 인증 흐름

```typescript
// lib/socket.ts
export const socket = io(baseURL, {
    transports: ["websocket"],
    auth: (cb) => {
        const token = localStorage.getItem("access_token");
        cb({ token });  // JWT 토큰을 소켓 핸드셰이크에 포함
    }
});
```

- 서버는 소켓 미들웨어에서 JWT 검증
- 토큰 만료 시 HTTP 인터셉터(`apiClient`)가 자동 갱신
- 갱신 후 `socket.disconnect()` → `socket.connect()`로 새 토큰 적용
