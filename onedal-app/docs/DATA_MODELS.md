# 📦 1DAL 공유 데이터 모델 명세서

> **문서 상태**: v1.0  
> **작성일**: 2026-05-05  
> **근거 코드**: `SharedModels.kt` (206줄), `shared/src/index.ts`  
> **목적**: 앱(Kotlin) ↔ 서버(TypeScript) 간 주고받는 모든 데이터 구조를 필드 단위로 정의

---

## 1. SimplifiedOfficeOrder — 리스트 콜 데이터

리스트 화면에서 파싱된 콜 한 건의 기본 정보입니다.  
텔레메트리(`/scrap`)와 1차 배차 보고(`/confirm`)에 사용됩니다.

| 필드 | Kotlin 타입 | TS 타입 | 필수 | 기본값 | 설명 |
|------|------------|---------|:---:|--------|------|
| `id` | String | string | ✅ | - | 오더 고유 ID (`AUTO-타임스탬프` 또는 `MANUAL-타임스탬프`) |
| `type` | String | string | ✅ | `"NEW_ORDER"` | 오더 유형 (`NEW_ORDER`, `AUTO_CLICK`, `MANUAL_CLICK`) |
| `pickup` | String | string | ✅ | - | 상차지 (예: `"경기 광주시 경안동"`) |
| `dropoff` | String | string | ✅ | - | 하차지 (예: `"서울 강남구 역삼동"`) |
| `fare` | Int | number | ✅ | `0` | 운임 요금 (원 단위, 0이면 파싱 실패) |
| `timestamp` | String | string | ✅ | - | ISO 8601 형식 (`yyyy-MM-dd'T'HH:mm:ss'Z'`) |
| `postTime` | String? | string? | ❌ | `null` | 게시 시간 (인성앱 표시 기준) |
| `scheduleText` | String? | string? | ❌ | `null` | 예약 배송 텍스트 |
| `vehicleType` | String? | string? | ❌ | `null` | 차종 코드 (`"오"`, `"다"`, `"라"`, `"1t"` 등) |
| `rawText` | String? | string? | ❌ | `null` | 스크랩한 원본 텍스트 전체 |
| `pickupX` | Double? | number? | ❌ | `null` | 상차지 경도 (지오코딩 후 서버에서 채움) |
| `pickupY` | Double? | number? | ❌ | `null` | 상차지 위도 |
| `dropoffX` | Double? | number? | ❌ | `null` | 하차지 경도 |
| `dropoffY` | Double? | number? | ❌ | `null` | 하차지 위도 |
| `pickupDistance` | Double? | number? | ❌ | `null` | 현재 위치에서 상차지까지 거리 (km) |

---

## 2. DetailedOfficeOrder — 상세 콜 데이터

팝업 서핑을 통해 수집된 상세 정보를 포함합니다.  
2차 배차 보고(`/detail`)에 사용됩니다.

| 필드 | 타입 | 필수 | 설명 |
|------|------|:---:|------|
| `id` | String | ✅ | (SimplifiedOfficeOrder 동일) |
| `type` | String | ✅ | |
| `pickup` | String | ✅ | |
| `dropoff` | String | ✅ | |
| `fare` | Int | ✅ | |
| `timestamp` | String | ✅ | |
| `rawText` | String? | ❌ | 누적 팝업 텍스트 (`[적요상세/정보]\n...\n[출발지상세]\n...\n[도착지상세]\n...`) |
| `pickupX/Y` | Double? | ❌ | |
| `dropoffX/Y` | Double? | ❌ | |
| `pickupDistance` | Double? | ❌ | |
| **— 상세 추가 필드 —** | | | |
| `distanceKm` | Double? | ❌ | 전체 운행 거리 (km) |
| `dispatcherName` | String? | ❌ | 배차사 이름 (예: `"고양퀵서비스"`) |
| `dispatcherPhone` | String? | ❌ | 배차사 연락처 |
| `receiptStatus` | String? | ❌ | `"신규"` 또는 `"수정"` |
| `commissionRate` | String? | ❌ | 수수료율 (예: `"23%"`) |
| `tollFare` | String? | ❌ | 통행료 |
| `tripType` | String? | ❌ | `"편도"` 또는 `"왕복"` |
| `orderForm` | String? | ❌ | `"급송"` 또는 `"일반"` |
| `detailMemo` | String? | ❌ | 적요 상세 원문 |
| `paymentType` | String? | ❌ | `"신용"`, `"착불"`, `"선불"` |
| `billingType` | String? | ❌ | `"계산서"`, `"인수증"`, `"무과세"` |
| `vehicleType` | String? | ❌ | `"다마스"`, `"1t카고"` 등 |
| `itemDescription` | String? | ❌ | `"박스 2개"`, `"마대 1개"` 등 |
| `companyName` | String? | ❌ | 화주 상호 |
| `pickupTime` | String? | ❌ | 픽업 예약 시간 |

---

## 3. FilterConfig — 배차 필터 설정

관제탑에서 설정한 필터가 서버를 거쳐 앱으로 내려옵니다.  
`/scrap` 응답의 `dispatchEngineArgs` 필드로 수신됩니다.

| 필드 | 타입 | 기본값 | 설명 |
|------|------|--------|------|
| `allowedVehicleTypes` | List\<String\> | `[]` (전체) | 허용 차종 목록 (빈 배열 = 모든 차종) |
| `isActive` | Boolean | `true` | Full Auto 활성화 여부 |
| `isSharedMode` | Boolean | `false` | 합짐 모드 여부 |
| `pickupRadiusKm` | Int | `10` | 상차지 허용 반경 (km) |
| `minFare` | Int | `0` | 최소 운임 필터 (원) |
| `maxFare` | Int | `1000000` | 최대 운임 필터 (원) |
| `destinationCity` | String | `""` | 하차지 주요 도시 |
| `destinationRadiusKm` | Int | `10` | 하차지 허용 반경 (km) |
| `excludedKeywords` | List\<String\> | `[]` | 제외 키워드 (이 단어가 있으면 거름) |
| `destinationKeywords` | List\<String\> | `[]` | 목적지 포함 키워드 |
| `customCityFilters` | List\<String\> | `[]` | 동명이동 방어용 상위 지역명 |
| `destinationGroups` | Map\<String, List\<String\>\> | `{}` | 목적지 그룹별 키워드 |
| `customFilters` | List\<String\> | `[]` | 사용자 정의 필터 |

---

## 4. ScrapPayload & ScrapResponse — 텔레메트리 통신 규격

### ScrapPayload (요청)

| 필드 | 타입 | 설명 |
|------|------|------|
| `deviceId` | String | 기기 ID |
| `data` | List\<SimplifiedOfficeOrder\> | 수집된 콜 배열 |
| `screenContext` | String? | 현재 ScreenContext 값 |
| `isHolding` | Boolean | 콜 처리 중 여부 |
| `lat` | Double? | GPS 위도 |
| `lng` | Double? | GPS 경도 |
| `ackDecisionId` | String? | 이전 판결 수신 확인 ID |

### ScrapResponse (응답)

| 필드 | 타입 | 설명 |
|------|------|------|
| `success` | Boolean | 요청 성공 여부 |
| `apiStatus` | ApiStatus | 서버 누적 통계 |
| `deviceControl` | DeviceControl | 모드 지시 (`AUTO`/`MANUAL`) |
| `dispatchEngineArgs` | FilterConfig? | 최신 필터 (null이면 기존 유지) |
| `decision` | DecisionPayload? | Piggyback 판결 |

---

## 5. 비상 관련 모델

### EmergencyReport (요청)

| 필드 | 타입 | 설명 |
|------|------|------|
| `deviceId` | String | 기기 ID |
| `orderId` | String | 대상 오더 ID |
| `reason` | String | EmergencyReason 값 |
| `screenContext` | String | 현재 화면 상태 |
| `screenText` | String | 추가 설명 텍스트 |
| `timestamp` | String | ISO 타임스탬프 |

### EmergencyReason

| 값 | 설명 |
|---|------|
| `AUTO_CANCEL` | 타임아웃 자동취소 |
| `CANCEL_EXPIRED` | "취소할 수 없습니다" 팝업 감지 |
| `UNKNOWN_SCREEN` | 알 수 없는 화면 |
| `BUTTON_NOT_FOUND` | 버튼 못 찾음 |
| `APP_CRASH` | 앱 비정상 종료 |

---

## 6. 기기 연동 모델

### PairDeviceRequest (요청)

| 필드 | 타입 | 필수 | 설명 |
|------|------|:---:|------|
| `pin` | String | ✅ | 6자리 PIN |
| `deviceId` | String | ✅ | 기기 ID |
| `deviceName` | String? | ❌ | 기기 이름 (빈 문자열이면 생략) |

### PairDeviceResponse (응답)

| 필드 | 타입 | 설명 |
|------|------|------|
| `success` | Boolean | 연동 성공 여부 |
| `message` | String? | 성공 메시지 |
| `error` | String? | 에러 메시지 |

---

## 7. ScreenTextNode — 화면 파싱 내부 모델

화면에서 추출된 텍스트 노드 한 칸. API 전송에는 사용되지 않으며, 파싱 엔진 내부에서만 사용됩니다.

| 필드 | 타입 | 설명 |
|------|------|------|
| `text` | String | 노드의 텍스트 |
| `node` | AccessibilityNodeInfo | 원본 노드 참조 (터치 좌표 획득용) |
| `rect` | Rect | 화면 좌표 (Bounding Box) |

**isFareCandidate()**: 차종 코드 패턴 매칭 — `"오"`, `"다"`, `"라"`, `"1t"`, `"1.4"`, `"2.5t"`, `"3.5t"`, `"5t"`, `"11t"`, `"14t"`, `"18t"`, `"25t"`
