# 앱 콜 데이터 생애주기 (Lifecycle)

안드로이드 앱 내부에서 파싱된 콜 객체(SimplifiedOfficeOrder)들이 탄생(생성)해서 서버로 넘어가기까지의 전체 생애 주기(Lifecycle)와 관리 기법.

## 1단계: 파생 및 1차 검문 (Deduplication - 해시 기반 중복 제거)
HijackService가 화면에서 텍스트를 파싱해 새 콜 객체를 만들어내면, 가장 먼저 과거에 처리했던 콜인지 검사한다.

- **기준:** (출발지 + 도착지 + 요금) 문자열을 하나로 합쳐서 해시코드(Hash)를 만든다.
- **캐싱 로직:** 이 해시값을 processedOrderHashes라는 바구니에 담는다. 만약 이번 화면 깜빡임에서 동일한 해시값이 또 들어온다면 이미 처리한(본 적 있는) 콜로 간주하여 가차 없이 버린다 (서버 부하 방지).
- **메모리 최적화:** 이 바구니는 무한정 쌓이지 않고 100개(MAX_ORDER_HASH_CACHE)가 꽉 차면 가장 오래된 것들을 지우고 최신 50개만 남겨 앱 메모리를 가볍게 유지한다.

## 2단계: 자동 사냥(AUTO) 인터셉터
만약 현재 관제탑에서 AUTO 모드를 지시한 상태라면, 서버로 콜 목록을 보내기 전에 앱이 먼저 꿀콜을 낚아채려고 시도한다.

- 파싱된 콜을 scrapParser.shouldClick(order) 이라는 채에 걸러본다.
- 조건에 맞으면 서버 허락도 받지 않고 즉시 화면의 해당 콜을 광클(Touch) 해버린다.
- 터치에 성공하면 사냥 세션(isAutoSessionActive = true)에 돌입하며, 다른 콜들을 쳐다보지도 않고 오직 "상세/확정 화면"으로 넘어가기 위해 집중한다.

## 3단계: 버퍼링 대기조 (TelemetryManager Queueing)
광클 대상이 아니거나 수동(MANUAL) 모드라서 콜을 그냥 관제탑에 보고만 해야 하는 경우, 이 콜들은 TelemetryManager의 scrapBuffer라는 메모리 대합실(Queue)에 차곡차곡 쌓인다.

- 사용자가 창을 미친 듯이 스크롤해서 짧은 시간 안에 콜이 여러 개 잡혀도, 당황하지 않고 이 버퍼에 전부 담는다.

## 4단계: 이벤트 기반 즉시 발송 + 생존신고 (Event-Driven Flush + Heartbeat)
TelemetryManager는 두 가지 방식으로 서버와 통신한다.

- **이벤트 기반 즉시 발송:** 새 콜이 enqueue()로 버퍼에 들어오면, 300ms(DEBOUNCE_MS) 디바운스 대기 후 버퍼에 쌓인 콜들을 한꺼번에 꺼내 /api/scrap API로 일괄 발송(POST)한다. 300ms 안에 콜이 더 들어오면 타이머가 리셋되어 모아서 한 번에 쏜다.
- **생존신고 (Heartbeat):** 콜이 없어서 이벤트 발송이 일어나지 않더라도, 20초(HEARTBEAT_INTERVAL_MS = 20000L)마다 빈 배열 [ ]을 /api/scrap으로 쏴서 "나 안 죽고 살아있다" 라는 생존 핑을 서버에 보고한다.
- **타이머 조율:** 이벤트 발송이 일어나면 하트비트 타이머를 20초 뒤로 리셋하여, 방금 통신했는데 또 생존신고를 보내는 중복 통신을 방지한다.

## 5단계: 관제탑 역명령 하달 (Feedback Loop)
서버로 /api/scrap 을 쏜 직후 서버로부터 응답이 돌아올 때, 서버가 "이제 AUTO 모드로 바꿔!" 라던지 "SHUTDOWN(퇴근) 해!" 라고 명령을 끼워 보낼 수 있다.

- 앱은 보고를 올리고 이 응답을 받는 즉시 앱의 근무 모드를 변경하여 다음 사이클에 대비한다.

## 요약
앱 내에서 만들어진 콜은 "본 건지 확인(해시 중복 제거) → 꿀콜이면 광클(AUTO 인터셉트) → 아니면 메모리 대합실에 넣기 → 300ms 디바운스 후 즉시 서버에 일괄 배송 (콜 없으면 20초마다 생존신고)"의 파이프라인으로 관리된다.

---

# 🌐 서버 통신 API 데피니션 (Networking & APIs)

앱이 관제탑(Node.js 서버)과 주고받는 주요 API 스펙은 용도에 따라 3가지로 명확히 분리된다.

### 1. 콜 목록 스크랩용: `POST /api/scrap`
- **목적:** 수동이든 자동이든 화면에서 긁어온 순수 콜 정보들을 서버(관제탑 로그 및 DB)로 보고하는 용도. (인터셉트 되지 않은 일반 콜들)
- **발송 구조:** 300ms 디바운스 이벤트 전송 또는 20초 주기 생존신고(빈 배열).
- **Request Payload (ScrapPayload):**
  - `deviceId`: 기기 고유 ID
  - `screenContext`: 현재 화면 상태 ("LIST", "DETAIL_PRE_CONFIRM" 등)
  - `data`: `SimplifiedOfficeOrder[]` 배열 (id, type, pickup, dropoff, fare, pickupDistance, vehicleType, timestamp, rawText 포함)
- **Response 리턴 대기 여부:** 즉시 리턴됨 (Non-blocking).
- **서버 Response:** `"AUTO"`, `"MANUAL"`, `"SHUTDOWN"` 등 다음 사이클에 앱이 행동할 **근무 모드 스트링 값**을 반환. (앱은 이를 즉시 캐치해 모드 전환함)

### 2. 1차 확정 (낚아채기) 보고용: `POST /api/orders/confirm`
- **목적:** 앱이 AUTO 모드 중에 '꿀콜'로 판별하여 광클(터치)에 성공한 직후, "내가 방금 이 콜을 낚아챘다!" 라고 관제탑에 신속 보고하는 API.
- **Request Payload (DispatchBasicRequest):**
  - `step`: "BASIC"
  - `order`: 낚아챈 `SimplifiedOfficeOrder` 단일 객체
- **Response 리턴 대기 여부:** 타임아웃 5초 이내 즉시 응답 (서버는 이 데이터를 받아 관제탑 화면을 갱신함).

### 3. 상세 정보 전송 및 2차 서버 판결 대기용: `POST /api/orders/detail`
- **목적:** 확정된 콜의 상세 페이지 팝업(출발지/도착지/적요)을 모두 열어서 긴 텍스트(상세정보)를 수집한 뒤, 이를 서버에 보내 **"최종 유지(KEEP)할지, 뱉을지(CANCEL)" 결재를 요청**하는 API.
- **Request Payload (DispatchDetailedRequest):**
  - `step`: "DETAILED"
  - `order`: `DetailedOfficeOrder` (SimplifiedOrder에 `rawText`로 상세 팝업 장문 텍스트가 모두 병합된 객체)
- **Response 리턴 대기 여부:** **롱폴링 대기 (최대 40초 대기 / Death Valley)**. 서버가 카카오 API 연산, 수익률 검사 및 관제탑 직원의 수동 승인/거절을 클릭할 때까지 HTTP 커넥션을 들고 기다림.
- **서버 Response:** `{"orderId": "...", "action": "KEEP" | "CANCEL"}` 형태로 판결(Decision) 반환.
  - 앱은 응답(`KEEP`이면 '닫기', `CANCEL`이면 '취소')에 맞춰 즉시 화면의 버튼을 눌러 임무를 완수함.

---

# 🎯 AUTO 모드 사냥 필터링 체계 (Smart Filter)

앱이 `shouldClick(order)` 을 통해 화면에 뜬 `SimplifiedOfficeOrder`를 광클(1차 선점)할지 거를지 판별하는 4대 교집합(AND) 조건. (모두 통과해야 터치 실행)

1. **조건 1: 도착지 매칭 (Target Regions)**
   - **타입:** `List<String>` (예: `["서울", "경기", "인천"]`)
   - **비교 로직:** 수집된 `order.dropoff` 혹은 전체 `rawText` 문자열 내에 배열 요소 중 하나라도 포함되어 있으면 통과 (`any`). (필터가 비어있으면 무조건 통과)
2. **조건 2: 요금 하한선 (Min Fare)**
   - **타입:** `Int` (예: `40000`원)
   - **비교 로직:** 파싱된 `order.fare >= filter.minFare` 면 통과.
3. **조건 3: 상차지 직선거리 반경 (Pickup Radius)**
   - **타입:** `Double` (예: `10.0`km)
   - **비교 로직:** `order.pickupDistance <= filter.pickupRadius`. 단, 파서가 거리값을 추출하지 못해 `null`인 경우, 가짜(?) 데이터 유실을 막기 위해 **임시로 무조건 통과(true)** 처리함.
4. **조건 4: 블랙리스트 키워드 방어 (Blacklist)**
   - **타입:** `List<String>` (예: `["혼적", "착불", "수작업"]`)
   - **비교 로직:** 전체 `rawText` 안에 블랙리스트 단어가 단 하나라도 없어야 통과 (`none`). 발견되면 즉시 기각.