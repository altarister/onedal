# 🔌 1DAL 백엔드 API & Piggyback 명세서

> **문서 상태**: v2.0 (상세 확장판)  
> **목적**: 앱과 서버 간의 REST API 명세 및 **Piggyback V2** 프로토콜의 JSON 스키마를 상세 정의합니다.

---

## 1. REST API 명세

### 1.1 `POST /api/scrap` (하트비트 & 피기백 엔드포인트)
안드로이드 앱의 텔레메트리(`TelemetryManager`)가 1.0초(또는 20초) 단위로 쏘아 올리는 핵심 API입니다.

**Request Body (앱 ➡️ 서버)**
```typescript
interface ScrapPayload {
  deviceId: string;
  targetApp: string;            // "insung" | "hwamul24"
  screenContext: string;        // "LIST" | "DETAIL"
  isHolding: boolean;           // 팝업이 떠있어 스크롤이 멈췄는지 여부
  lat?: number;                 // 앱폰(차량) 현재 위도
  lng?: number;                 // 앱폰(차량) 현재 경도
  ackDecisionId?: string;       // 직전에 수신한 피기백 명령의 처리 완료 보고 ID
  data: SimplifiedOfficeOrder[];// 화면에서 파싱된 오더 덩어리
}
```

**Response Body (Piggyback V2 Protocol: 서버 ➡️ 앱)**
서버는 이 응답에 단순 ACK가 아닌, **관제탑의 상태 변화**와 **터치 명령**을 실어서 반환합니다.

```typescript
interface ScrapResponse {
  success: boolean;
  receivedCount: number;        // 정상 파싱된 오더 개수
  
  /** 서버(관제탑)에서 앱으로 내리는 클릭/취소 명령 (Ghost Defense 용도로 orderId 포함) */
  decisions?: Array<{
    orderId: string;            
    action: "KEEP" | "CANCEL";  
  }>;
  
  /** 최신 스캐너 제어 상태 (앱은 이 값을 받아 즉각 스크래핑을 중지하거나 재개함) */
  filter: {
    isActive: boolean;          // true면 스캐너 가동, false면 정지
    isSharedMode: boolean;      // 합짐 모드 여부
  };
}
```

### 1.2 `POST /confirm/basic` & `POST /confirm/detailed`
앱이 1차 필터를 통과하고 상세 팝업을 열었을 때, 최종 심사를 서버로 위임하는 API입니다.

**Request Body**
```typescript
interface DispatchDetailedRequest {
  step: "DETAILED";
  deviceId: string;
  targetApp: string;
  capturedAt: string;           // ISO-8601
  matchType: "AUTO" | "MANUAL";
  order: DetailedOfficeOrder;   // 적요, 전체 주소 텍스트가 포함된 오더
}
```
**Response**
- `HTTP 202 Accepted`: 서버가 콜을 접수하고 심사(카카오 연산)에 들어갔음을 의미. (최종 판결은 이후의 `/api/scrap` 피기백으로 수신됨)

---

## 2. WebSocket 통신 명세 (Server ↔ React UI)

관제사 화면(React Dashboard)의 실시간 렌더링을 위한 Socket.io 이벤트입니다.

### 2.1 Server ➡️ UI (서버가 관제탑으로 쏘는 이벤트)
| 이벤트명 | Payload 타입 | 설명 |
|---|---|---|
| `order-evaluated` | `PendingOrder` | 3단계 심사(카카오+요율)가 끝난 꿀/똥 판독 결과물 전달 |
| `order-confirmed` | `string` (orderId) | 앱이 피기백(KEEP)을 수신하고 실제 [닫기] 터치까지 성공했음을 보고 |
| `order-canceled` | `{ id: string, status: string }` | 데스밸리 타임아웃 등으로 오더가 소멸됨 |
| `filter-updated` | `AutoDispatchFilter` | 회랑 갱신이나 모드 변경으로 관제탑 UI 필터바 동기화 |
| `sync-active-orders` | `MyOrder[]` | 서버 재시작 시 DB에서 콜을 불러와 화면 강제 복구 |

### 2.2 UI ➡️ Server (관제사가 서버로 쏘는 이벤트)
| 이벤트명 | Payload 타입 | 설명 |
|---|---|---|
| `dispatch-decision` | `{ orderId: string, action: 'KEEP' \| 'CANCEL' }` | 심사표를 본 관제사가 최종 결재 버튼 클릭 (서버는 이를 피기백 큐에 넣음) |
| `recalculate-route` | `{ orderId: string, priority: string }` | 관제사가 [경로 재탐색] 버튼을 눌러 OSRM -> 카카오로 변경 요청 |

---

## 3. 관제탑 대시보드 API (Server ↔ React UI)

관제사가 웹브라우저에서 설정을 변경하거나 통계를 조회할 때 사용하는 엔드포인트입니다. (주요 라우터 요약)

### 3.1 설정 및 기기 관리 (`/api/settings`, `/api/devices`)
* **`GET /api/settings/pricing`**: 기사님의 동적 요금 엔진 설정값(`vehicleRates`, `agencyFeePercent`, `maxDiscountPercent`) 조회
* **`POST /api/settings/pricing`**: 요금 설정값 업데이트
* **`GET /api/devices`**: 연결된 안드로이드 앱폰 기기 목록 및 활성 상태 조회

### 3.2 필터 관리 (`/api/filters`)
* **`GET /api/filters/keywords`**: 블랙리스트 텍스트, 제외 키워드 목록 조회
* **`PUT /api/filters/keywords`**: 키워드 추가/삭제 (실시간으로 `AutoDispatchFilter`에 반영됨)

### 3.3 운행 일지 (Logbook)
* **`GET /api/logbook/analytics/daily`**: 일별 매출, 순수익, 운행 거리, 소요 시간 통계
* **`GET /api/logbook/places/frequent`**: `places` 테이블을 조회하여 가장 많이 방문한 거래처/상차지 Top 10 반환

### 3.4 카카오 프록시 (`/api/kakao`)
* React 프론트엔드에서 지도(Map)를 그리기 위해 카카오 API를 직접 호출하면 CORS나 키 노출 문제가 발생하므로, 백엔드가 대신 호출해 주는 프록시 엔드포인트입니다.
