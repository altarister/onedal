# 🌐 1DAL 앱 ↔ 서버 API 명세서

> **문서 상태**: v1.0  
> **작성일**: 2026-05-05  
> **근거 코드**: `ApiClient.kt` (461줄), `SharedModels.kt` (206줄), `TelemetryManager.kt` (200줄)  
> **목적**: 앱과 서버 간 모든 HTTP 엔드포인트, Piggyback 폴링 프로토콜, 에러 처리 규격을 정의

---

## 1. 서버 URL 스위칭

앱은 `SharedPreferences` 설정에 따라 로컬/라이브 서버를 동적으로 전환합니다.

| 모드 | URL 생성 규칙 | 예시 |
|------|------|------|
| **로컬 (isLiveMode=false)** | `http://{localPcIp}{endpoint}` | `http://172.30.1.89:4000/api/scrap` |
| **라이브 (isLiveMode=true)** | `https://1dal.altari.com{endpoint}` | `https://1dal.altari.com/api/scrap` |

- `localPcIp` 기본값: `"172.30.1.89:4000"`
- 사용자가 `http://`를 안 붙였을 경우 자동 보정

---

## 2. API 엔드포인트 목록

### 2-1. `POST /api/scrap` — 텔레메트리 (생존신고 + 콜 데이터 벌크 전송)

가장 핵심적인 엔드포인트. 앱의 생사 확인, 콜 데이터 전송, 서버 설정 수신, 관제탑 판결 수신을 **한 번의 통신**으로 모두 처리합니다.

**전송 주기:**
- 기본: **60초** 주기 하트비트 (버퍼 비어있어도 전송)
- 콜 수집 시: **300ms 디바운스** 후 즉시 전송
- 판결 대기 시: **1초** 주기 고속 폴링 (Piggyback 수신 가속)
- 화면 전환 시: **200ms 디바운스** 후 즉시 전송

**요청 (Request):**
```json
{
    "deviceId": "앱폰-Galaxy-123",
    "data": [
        {
            "id": "AUTO-1714821234567",
            "type": "NEW_ORDER",
            "pickup": "경기 광주시 경안동",
            "dropoff": "서울 강남구 역삼동",
            "fare": 55000,
            "timestamp": "2026-05-05T09:00:00Z",
            "vehicleType": "다",
            "rawText": "원본 파편 텍스트..."
        }
    ],
    "screenContext": "LIST",
    "isHolding": false,
    "lat": 37.4291,
    "lng": 127.1271,
    "ackDecisionId": "prev-order-id-or-null"
}
```

| 필드 | 타입 | 필수 | 설명 |
|------|------|:---:|------|
| `deviceId` | String | ✅ | 기기 고유 식별자 |
| `data` | SimplifiedOfficeOrder[] | ✅ | 수집된 콜 배열 (빈 배열 가능) |
| `screenContext` | String | ✅ | 현재 화면 상태 (`LIST`, `DETAIL_PRE_CONFIRM` 등) |
| `isHolding` | Boolean | ✅ | 콜 처리 중 여부 (확정 클릭 ~ 리스트 복귀) |
| `lat` | Double? | ❌ | 앱폰(차량) 위도 (GPS 미허용 시 null) |
| `lng` | Double? | ❌ | 앱폰(차량) 경도 |
| `ackDecisionId` | String? | ❌ | 이전 Piggyback 판결 수신 확인 ID |

**응답 (Response — 200 OK):**
```json
{
    "success": true,
    "apiStatus": {
        "success": true,
        "totalItems": 42
    },
    "deviceControl": {
        "mode": "AUTO"
    },
    "dispatchEngineArgs": {
        "allowedVehicleTypes": ["다", "라", "1t"],
        "isActive": true,
        "isSharedMode": false,
        "pickupRadiusKm": 15,
        "minFare": 30000,
        "maxFare": 1000000,
        "destinationCity": "부천",
        "destinationKeywords": ["강남", "송파"],
        "excludedKeywords": ["제주"],
        "customCityFilters": ["부천", "인천 부평"],
        "destinationGroups": {},
        "customFilters": []
    },
    "decision": {
        "orderId": "AUTO-1714821234567",
        "action": "KEEP"
    }
}
```

| 응답 필드 | 타입 | 설명 |
|-----------|------|------|
| `apiStatus.totalItems` | Int | 서버에 누적된 총 스크랩 건수 |
| `deviceControl.mode` | String | 서버가 지시하는 모드 (`"AUTO"` or `"MANUAL"`) |
| `dispatchEngineArgs` | FilterConfig? | 최신 필터 설정 (null이면 기존 유지) |
| `decision` | DecisionPayload? | **Piggyback 판결** — 있으면 즉시 행동 실행 |

**Piggyback 프로토콜:**
1. 앱이 `/detail`을 보내면 서버가 판결을 큐에 넣음
2. 앱의 다음 `/scrap` 요청 시 서버가 `decision` 필드에 판결을 태워 보냄
3. 앱은 판결 수신 후 `pendingAckDecisionId`에 orderId를 저장
4. 다음 `/scrap` 요청에 `ackDecisionId`로 수신 확인을 보냄
5. 서버는 ACK를 확인하고 큐에서 판결을 삭제

---

### 2-2. `POST /api/orders/confirm` — 배차 1차 보고 (BASIC)

기사님 또는 AUTO 매크로가 콜 상세 화면에 진입했을 때 즉시 전송합니다.

**요청:**
```json
{
    "step": "BASIC",
    "deviceId": "앱폰-Galaxy-123",
    "order": {
        "id": "AUTO-1714821234567",
        "type": "AUTO_CLICK",
        "pickup": "경기 광주시 경안동",
        "dropoff": "서울 강남구 역삼동",
        "fare": 55000,
        "timestamp": "2026-05-05T09:00:00Z",
        "rawText": "상세 화면 원문..."
    },
    "capturedAt": "2026-05-05T09:00:00Z",
    "matchType": "AUTO"
}
```

| 필드 | 설명 |
|------|------|
| `step` | 항상 `"BASIC"` |
| `matchType` | `"AUTO"` (매크로 클릭) or `"MANUAL"` (기사님 직접) |
| `order.type` | `"AUTO_CLICK"` or `"MANUAL_CLICK"` |

**응답 (200 OK):** 서버의 초기 접수 확인 (판결 아님)

**타임아웃:** 5초 (즉시 응답 예상)

---

### 2-3. `POST /api/orders/detail` — 배차 2차 상세 보고 (DETAILED)

팝업 서핑이 완료된 후, 적요·출발지·도착지 텍스트를 모두 수집하여 전송합니다.

**요청:**
```json
{
    "step": "DETAILED",
    "deviceId": "앱폰-Galaxy-123",
    "order": {
        "id": "AUTO-1714821234567",
        "type": "AUTO_CLICK",
        "pickup": "경기 광주시 경안동",
        "dropoff": "서울 강남구 역삼동",
        "fare": 55000,
        "timestamp": "2026-05-05T09:00:00Z",
        "rawText": "[적요상세/정보]\n적요 내용: 박스 2개\n...\n[출발지상세]\n전화1: 010-...\n...\n[도착지상세]\n전화1: 010-...\n...",
        "distanceKm": null,
        "dispatcherName": "고양퀵서비스",
        "commissionRate": "23%",
        "paymentType": "신용",
        "itemDescription": "박스 2개"
    },
    "capturedAt": "2026-05-05T09:00:05Z",
    "matchType": "AUTO"
}
```

**응답:** `200 OK` 또는 `202 Accepted` (서버가 큐에 등록 후 즉시 반환)

**실패 시:** 앱이 판결을 `"CANCEL"`로 간주하고 취소 집행

---

### 2-4. `POST /api/orders/decision` — 수동 판결 직통 전송

앱 내에서 기사님이 직접 KEEP/CANCEL 버튼을 누를 때 사용합니다.

**요청:**
```json
{
    "orderId": "MANUAL-1714821234567",
    "action": "KEEP"
}
```

| action 값 | 의미 |
|-----------|------|
| `"KEEP"` | 배차 확정 (가져감) |
| `"CANCEL"` | 배차 거절 (취소) |

---

### 2-5. `POST /api/emergency` — 비상 보고

비정상 상황 발생 시 서버에 즉시 보고합니다.

**요청:**
```json
{
    "deviceId": "앱폰-Galaxy-123",
    "orderId": "AUTO-1714821234567",
    "reason": "AUTO_CANCEL",
    "screenContext": "DETAIL_CONFIRMED",
    "screenText": "데스밸리 응답 없음 강제취소",
    "timestamp": "2026-05-05T09:01:00Z"
}
```

| reason 값 | 의미 |
|-----------|------|
| `AUTO_CANCEL` | 데스밸리 타임아웃 자동취소 |
| `CANCEL_EXPIRED` | "취소할 수 없습니다" 팝업 감지 |
| `UNKNOWN_SCREEN` | 알 수 없는 화면 상태 |
| `BUTTON_NOT_FOUND` | 대상 버튼(확정/취소)을 찾지 못함 |
| `APP_CRASH` | 앱 비정상 종료 |

---

### 2-6. `POST /api/devices/pair` — 기기 PIN 연동

최초 1회 기기 등록 시 사용합니다.

**요청:**
```json
{
    "pin": "123456",
    "deviceId": "앱폰-Galaxy-123",
    "deviceName": "Galaxy S24"
}
```

**응답 (200):**
```json
{
    "success": true,
    "message": "기기 연동이 완료되었습니다."
}
```

**에러 응답 (4xx):**
```json
{
    "success": false,
    "error": "유효하지 않은 PIN입니다."
}
```

---

### 2-7. `POST /api/devices/{deviceId}/offline` — 오프라인 통보

화면 꺼짐, 접근성 해제, 앱 종료 시 서버에 즉시 전송합니다.

- **Method:** POST
- **Body:** 없음
- **타임아웃:** connect 3초, read 1초 (응답을 기다리지 않고 즉시 종료)

---

### 2-8. `GET /api/config/keywords?app={앱이름}` — 키워드 사전 다운로드

서비스 시작 시 타겟 앱의 화면 판별 키워드를 서버에서 받아옵니다.

- **파라미터:** `app=인성콜` (URL 쿼리 스트링)
- **응답:** JSON 형태의 키워드 사전 (현재는 앱 내 하드코딩 사용, 서버 제공은 향후 확장)

---

## 3. 스레드 풀 분리

앱은 두 개의 독립 스레드풀을 사용하여 통신이 서로를 차단하지 않도록 합니다.

| 스레드풀 | 담당 API | 이유 |
|----------|----------|------|
| `confirmExecutor` | `/confirm`, `/detail`, `/emergency`, `/decision` | 콜 처리 통신 (응답 대기 가능) |
| `telemetryExecutor` | `/scrap`, `/devices/pair`, `/config/keywords`, `/offline` | 주기적 텔레메트리 (빈번한 호출) |

---

## 4. 공통 HTTP 설정

| 항목 | 값 |
|------|---|
| Content-Type | `application/json; charset=utf-8` |
| Accept | `application/json` |
| connectTimeout | 5,000ms (모든 엔드포인트) |
| readTimeout | 5,000ms (기본), 1,000ms (`/offline`만) |
| HTTP 라이브러리 | `java.net.HttpURLConnection` (Retrofit 미사용) |
| JSON 직렬화 | Gson |
