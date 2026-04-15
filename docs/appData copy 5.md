# 앱 콜 데이터 생애주기 (Lifecycle & Networking)

안드로이드 앱 내부에서 파싱된 콜 객체들이 탄생해서 서버로 넘어가기까지의 전체 생애 주기와 API 발송 단계를 순서대로 설명합니다.

## 0단계: 서버 부팅 및 디폴트 필터 세팅 (Filter Initialization)
서버(Node.js)가 부팅되면 `filterStore.ts`에서 디폴트 필터(`activeFilterConfig`)를 메모리에 세팅합니다.
- **디폴트 값 예시:**
 ```json
  { 
    "model": "1t", 
    "minFare": 40000, 
    "pickupRadiusKm": 30, 
    "destinationCity": "광주시", 
    "excludedKeywords": "착불,수거,까대기..." 
  }
  ```
- 이 필터는 관제탑(웹)에서 언제든 변경 가능하며, 변경되면 서버 메모리의 `activeFilterConfig`가 즉시 덮어씌워집니다.
- 앱이 아직 한 번도 `/api/scrap`을 호출하지 않은 상태에서는 앱 내부에 `SharedPreferences`에 저장된 이전 세션의 필터가 남아있거나, 없으면 `FilterConfig()` 기본값(빈 필터)을 사용합니다.

## 1단계: 앱 부팅 및 감시 엔진 점화 (App Boot)
앱이 켜지면 `TelemetryManager.start()`가 호출되어 20초 하트비트 타이머만 세팅해 놓습니다.
그런데 인성앱 화면은 이미 떠 있는 상태이기 때문에, `onAccessibilityEvent`가 거의 즉시 발동합니다.
화면 변경이 감지되면 `handleListScreen`이 호출되어 **파싱이 가장 먼저 실행**됩니다. (아래 2단계)

**📖 인성앱 파싱 문자열:**
> `9.0 42.8 @ 경기 광주시 서울 강남구 1t 7.6`
> `8.4 57.5 경기 광주시- 서울 강남구 오 9.9`
*(위 콜들은 두 개의 행으로 인식되며 차종 앵커 `1t`, `오`를 기준으로 각각의 오더 객체로 탄생합니다.)*

## 2단계: 콜 파생 및 1차 검문 (Parsing & Deduplication)
화면에 리스트가 나타나면 제일 먼저 차종(`1t`, `오` 등)을 기준점으로 위아래 글자들을 묶어 파싱합니다.
예를 들어 첫 번째 줄을 판독하면:
- `pickup`: "경기 광주시"
- `dropoff`: "서울 강남구"
- `fare`: 1t 옆의 7.6 → 76,000원
- `pickupDistance`: 숫자배열 앞쪽 9.0km
- `vehicleType`: "1t"

**검문 (중복 제거):**
- **기준:** 파싱 후 `(출발지 + 도착지 + 요금)` (예: `경기 광주시서울 강남구76000`) 문자열을 합쳐 해시(Hash)를 만듭니다.
- **캐싱 로직:** 이전에 본 해시값이면 가차 없이 버리고, 처음 본 해시값이면 `processedOrderHashes`에 등록 후 다음 단계로 넘어갑니다. (최대 100개 유지)

> **TODO: 요금 인상 콜 감지 (합짐 부적합 판별)**
> 현재 해시가 `(출발지+도착지+요금)`이므로, 같은 출발지→도착지인데 요금만 올라간 콜은 "완전히 새로운 콜"로 인식된다. 하지만 실제로는 같은 콜의 금액이 올라간 것이며, 이는 시간이 이미 상당히 촉박해진 상태를 의미한다. 촉박한 콜은 합짐을 할 여유가 없어 빠른 단독 배송이 필요하므로, `(출발지+도착지)`만으로 이전 콜을 조회하여 "요금이 올랐다 = 촉박하다 = 합짐 부적합" 판단 로직을 추가해야 한다.
> 몇분전에 올라온 콜인지 인지 할수 있으면 좋은데 .. 어떻게 표현해야 할지 모르겠다. 

## 3단계: 스크랩 발송 및 필터 수신 (`POST /api/scrap`)
파싱된 콜이 `enqueue()`로 `scrapBuffer`에 들어가면, 300ms 디바운스 대기 후 `flush()`가 호출되어 **이때 비로소 `POST /api/scrap`이 호출**됩니다.
- **Request Payload:**
  ```json
  {
    "deviceId": "앱폰-sdk_gpho-160",
    "screenContext": "LIST",
    "data": [
      {
        "id": "37b789b1-36d5-4c9e-b7fc-3c6111d69dbc",
        "type": "NEW_ORDER",
        "pickup": "경기 광주시",
        "dropoff": "서울 강남구",
        "fare": 76000,
        "pickupDistance": 9.0,
        "vehicleType": "1t",
        "timestamp": "2026-04-12T16:44:00Z",
        "postTime": null,
        "rawText": "9.0, 42.8, @, 경기 광주시, 서울 강남구, 1t, 7.6"
      }
    ]
  }
  ```
- **응답:** 즉시 반환됩니다. 서버는 응답 꼬리(Piggyback)로 3가지를 한꺼번에 내려줍니다:
  ```json
  {
    "apiStatus":          { "success": true, "totalItems": 14676 },
    "deviceControl":      { "mode": "MANUAL" },
    "dispatchEngineArgs": { "model": "1t", "minFare": 40000, "pickupRadiusKm": 30, ... }
  }
  ```
- 앱은 `dispatchEngineArgs`(=필터 정보)를 받자마자 `SharedPreferences`의 `"activeFilter"` 키에 덮어씌웁니다.
- 이후 매번 `/api/scrap`을 호출할 때마다 서버가 최신 필터를 내려주므로, 관제탑에서 필터를 변경하면 다음 scrap 응답 때 자연스럽게 앱에 전파됩니다.
- **생존신고:** 버퍼가 비어있어도 화면이 20초간 멈춰있으면, "저 안 죽었어요" 라고 빈 배열(`[]`)로 생존 핑을 보내며, 이때도 동일하게 최신 필터를 응답으로 받습니다.

## 4단계: 서버 태세 역명령 하달 (Feedback Loop)
3단계에서 `/api/scrap` 응답을 받을 때, 서버가 `deviceControl.mode` 값으로 명령을 섞어 보냅니다.
- `"MANUAL"`: 수동 모드 유지 (관제만 — 5단계 필터를 건너뛰고 파싱된 콜은 그냥 3단계에서 보고만 함)
- `"AUTO"`: 자동 사냥 모드 돌입 (5단계 필터 가동)
- `"SHUTDOWN"`: 퇴근 명령 → 앱은 즉시 타이머를 정지하고 모든 감시를 중단합니다.
- 앱은 응답을 받는 즉시 **근무 모드(currentMode)** 를 전환하고 다음 사이클에 대비합니다.

---
*이하 5~7단계는 4단계에서 `AUTO` 모드를 수신한 이후에만 실행되는 사냥 파이프라인입니다.*

## 5단계: 자동 사냥(AUTO) 필터 통과 판별 (Smart Filter)
`AUTO` 모드가 활성화된 상태에서 새로운 콜이 2단계에서 파싱되면, 앱은 서버로 보내기 전에 이 콜이 '꿀콜'인지 자체적으로 검증합니다.
3단계에서 서버로부터 받아 `SharedPreferences`에 저장해 둔 필터(`activeFilter`)를 꺼내어 4가지 조건(AND)을 모두 검사합니다.
- **조건 1 (도착지):** `dropoff`("서울 강남구")가 필터의 타겟 지역에 있는지?
- **조건 2 (요금 하한):** 파싱된 76,000원이 필터 최소요금(예: 4만원) 이상인지?
- **조건 3 (상차지 거리):** `1t` 콜의 접근거리 `9.0`km가 필터 반경(예: 10km) 이하인지?
- **조건 4 (블랙리스트):** 텍스트 내에 "혼적", "착불" 같은 기피 단어가 없는지?
✅ **결과:** 조건을 모두 통과했다면 터치(광클) 액션으로 넘어갑니다. 통과하지 못하면 3단계(스크랩)로 좌천됩니다.

## 6단계: 콜 1차 선점 및 낚아채기 보고 (`POST /api/orders/confirm`)
필터를 통과해 꿀콜을 광클(터치)하는 데 성공했다면, 앱은 사냥 집중 상태(`isAutoSessionActive=true`)가 됩니다.
- **API 호출:** 즉시 화면에서 구한 요약본(`SimplifiedOfficeOrder`)을 담아 관제탑에 보고합니다.
- **Request Payload:** `{"step": "BASIC", "order": {...방금 파싱한 1t 콜 객체...} }`
- **응답 대기 (Non-Blocking):** 5초 타임아웃 이내에 즉각 응답을 받으며, 서버는 이 결과를 이용해 관제탑 화면에 '진행 중'임을 뿌려줍니다.

## 7단계: 상세 정보 수집 후 서버 최종 판결 대기 (`POST /api/orders/detail`)
선점에 성공한 앱은 상세 팝업창 3개(적요, 출발, 도착)를 순식간에 열었다 닫으며 장문 텍스트(적요 내용, 전화번호 등)를 수집한 `DetailedOfficeOrder` 객체를 완성합니다.
- **API 호출:** 완성된 상세 데이터를 서버로 넘기고, 이 콜을 영구히 유지할지(KEEP), 취소하고 뱉을지(CANCEL) '최종 결재'를 서버에 요청합니다.
- **응답 대기 (Long-Polling / 대기):** 서버에서 카카오 맵 API를 호출해 동선을 계산하고, 관제탑 직원이 승인/거절을 판단할 때까지 **최대 40초를 살얼음판처럼 대기**합니다.
- **서버 Response:** `{"orderId": "...", "action": "KEEP" | "CANCEL"}` 이 떨어지면 응답에 맞게 화면의 닫기/취소 버튼을 클릭하고 해당 사냥을 마칩니다.

---

<!-- 
========================================
📝 용어 주석 (Glossary)
========================================

[scrapBuffer]
  TelemetryManager 안에 있는 메모리 리스트(mutableListOf<SimplifiedOfficeOrder>()).
  파싱된 콜 객체를 서버로 보내기 전에 잠깐 담아두는 대기실.

[enqueue()]
  HijackService가 파싱을 끝낸 콜 객체 하나를 scrapBuffer 대기실에 집어넣는 함수.
  넣는 즉시 300ms 디바운스 타이머를 세팅(또는 리셋)한다.

[300ms 디바운스]
  인성앱 화면이 바뀔 때 onAccessibilityEvent가 0.1초 안에 3~5번 연달아 폭격처럼 들어온다.
  디바운스 없이 매번 서버에 쏘면 같은 데이터를 3번 따로 전송하게 되므로,
  300ms 동안 추가 이벤트가 없을 때까지 기다렸다가 대기실에 쌓인 콜들을 한 방에 묶어 전송한다.
  300ms 안에 콜이 더 들어오면 타이머가 리셋되어 모아서 한 번에 쏜다.

[flush()]
  TelemetryManager에서 실제 서버 전송을 수행하는 핵심 함수. 아래 순서로 동작한다:
  1. 대기실 비우기: scrapBuffer에 쌓인 콜들을 통째로 복사(snapshot)한 뒤 대기실을 비운다.
  2. 택배 상자 포장: 복사한 콜들 + deviceId + screenContext를 ScrapPayload JSON으로 포장한다.
  3. 콘솔 로그 출력: 안드로이드 로그캣에 📦 [전송 페이로드] 형태로 전송 내용을 찍는다.
  4. 서버 전송 및 응답 처리: POST /api/scrap을 실제로 쏘고, 응답에서:
     - deviceControl.mode → 근무 모드 전환 (MANUAL/AUTO/SHUTDOWN)
     - dispatchEngineArgs → 필터 업데이트 (SharedPreferences 덮어씌우기)
     - SHUTDOWN이면 타이머 정지 + 앱 감시 중단
  5. 하트비트 타이머 리셋: 방금 통신했으므로 다음 생존신고(20초)를 다시 20초 뒤로 밀어놓는다.
     안 그러면 방금 쐈는데 2초 뒤에 또 빈 배열로 쏘는 중복 통신이 발생한다.

[dispatchEngineArgs / activeFilter]
  서버가 /api/scrap 응답에 피기백으로 내려주는 필터 객체.
  앱은 이 값을 SharedPreferences의 "activeFilter" 키에 JSON 문자열로 저장하고,
  shouldClick() 호출 시 꺼내어 4대 조건 검사에 사용한다.

  스키마 (AutoDispatchFilter):
  {
    "model": "1t",                        // 차종 필터 (1t, 오, 다, 라 등)
    "isActive": true,                     // 자동 사냥 활성화 여부
    "isSharedMode": false,                // 합짐 모드 여부
    "pickupRadiusKm": 30,                 // 상차지 접근 반경 (km)
    "minFare": 40000,                     // 최소 요금 (원)
    "maxFare": 1000000,                   // 최대 요금 (원)
    "destinationCity": "광주시",           // 도착지 기준 도시
    "destinationRadiusKm": 10,            // 도착지 반경 (km)
    "excludedKeywords": "착불,수거,까대기,전화금지,타일",  // 블랙리스트 키워드 (콤마 구분)
    "destinationKeywords": "광주시,경안동,송정동,...",      // 타겟 지역 키워드 (콤마 구분, GeoJSON에서 자동 생성)
    "customFilters": []                   // 확장용 커스텀 필터 배열
  }
-->


