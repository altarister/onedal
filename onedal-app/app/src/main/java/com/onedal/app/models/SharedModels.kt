package com.onedal.app.models

/**
 * 웹 관제탑(onedal-web/shared/src/index.ts)과 1:1 동기화된 Kotlin 데이터 모델입니다.
 * 앱 ↔ 서버 간 통신 규격의 단일 진실 공급원(Single Source of Truth)으로 사용됩니다.
 */

// ────────────────────────────────────────────────
// 0. Safety Mode V3: 화면 상태 타입 + 비상 보고
// ────────────────────────────────────────────────

/**
 * 앱폰이 현재 보고 있는 화면 상태 (서버 ScreenContextType과 1:1 대응)
 */
enum class ScreenContext(val value: String) {
    LIST("LIST"),                          // 콜 잡기 리스트 화면
    DETAIL_PRE_CONFIRM("DETAIL_PRE_CONFIRM"),  // 선점 직전 상세
    DETAIL_CONFIRMED("DETAIL_CONFIRMED"),      // 확정 후 상세 화면
    POPUP_PICKUP("POPUP_PICKUP"),              // 출발지 상세 팝업
    POPUP_DROPOFF("POPUP_DROPOFF"),            // 도착지 상세 팝업
    POPUP_MEMO("POPUP_MEMO"),                  // 적요 상세 팝업
    POPUP_ERROR("POPUP_ERROR"),                // 에러/실패 팝업
    LIST_COMPLETED("LIST_COMPLETED"),          // 완료 리스트 화면
    UNKNOWN("UNKNOWN");                        // 알 수 없는 화면
}

/**
 * 비상 보고 사유 (서버 EmergencyReason과 1:1 대응)
 */
enum class EmergencyReason(val value: String) {
    AUTO_CANCEL("AUTO_CANCEL"),           // 타임아웃 자동취소
    CANCEL_EXPIRED("CANCEL_EXPIRED"),     // "취소할 수 없습니다" 팝업
    UNKNOWN_SCREEN("UNKNOWN_SCREEN"),     // 알 수 없는 화면
    BUTTON_NOT_FOUND("BUTTON_NOT_FOUND"), // 버튼 못 찾음
    APP_CRASH("APP_CRASH");               // 앱 비정상 종료
}

/**
 * POST /api/emergency 요청 바디 (서버 EmergencyReport와 1:1 대응)
 */
data class EmergencyReport(
    val deviceId: String,
    val orderId: String,
    val reason: String,
    val screenContext: String,
    val screenText: String,
    val timestamp: String,
    val targetApp: String = "insung"
)

// ────────────────────────────────────────────────
// 1. 콜 데이터 모델 (웹의 SimplifiedOfficeOrder 대응)
// ────────────────────────────────────────────────
data class SimplifiedOfficeOrder(
    val id: String,
    val type: String = "NEW_ORDER",
    val pickup: String,
    val dropoff: String,
    val fare: Int = 0,
    val timestamp: String,
    val postTime: String? = null,
    val scheduleText: String? = null,
    val vehicleType: String? = null,
    val rawText: String? = null,
    val pickupX: Double? = null,
    val pickupY: Double? = null,
    val dropoffX: Double? = null,
    val dropoffY: Double? = null,
    val pickupDistance: Double? = null,
    /**
     * 배송거리(상차지 → 하차지, km). 리스트 최좌측 두 숫자 중 **두 번째** 값.
     * 단가 판정(fare ≥ deliveryDistance × ratePerKm[차종])의 입력 —
     * 예전에는 파싱하고 버렸다 (2026-08-13 필터 재설계에서 보존).
     */
    val deliveryDistance: Double? = null
)

// ────────────────────────────────────────────────
// 2. 상세 콜 데이터 (웹의 DetailedOfficeOrder 대응)
//    3단계(상세 페이지 스크래핑) 구현 시 사용
// ────────────────────────────────────────────────
data class DetailedOfficeOrder(
    // SimplifiedOfficeOrder 필드 포함
    val id: String,
    val type: String = "NEW_ORDER",
    val pickup: String,
    val dropoff: String,
    val fare: Int = 0,
    val timestamp: String,
    val rawText: String? = null,
    val pickupX: Double? = null,
    val pickupY: Double? = null,
    val dropoffX: Double? = null,
    val dropoffY: Double? = null,
    val pickupDistance: Double? = null,
    // 상세 추가 필드
    val distanceKm: Double? = null,
    val dispatcherName: String? = null,  // 배차사 이름
    val dispatcherPhone: String? = null, // 배차사 연락처
    val receiptStatus: String? = null,   // 신규/수정
    val commissionRate: String? = null,  // 수수료 (23%)
    val tollFare: String? = null,        // 탁송료
    val tripType: String? = null,        // 편도/왕복
    val orderForm: String? = null,       // 급송/일반
    val detailMemo: String? = null,      // 적요상세 원문
    val paymentType: String? = null,     // "신용", "착불", "선불" 등
    val billingType: String? = null,     // "계산서", "인수증", "무과세"
    val vehicleType: String? = null,     // "다마스", "1t카고" 등
    val itemDescription: String? = null, // "박스 2개", "마대 1개" 등
    val companyName: String? = null,     // 화주 상호
    val pickupTime: String? = null       // 픽업 예약 시간
)

// ────────────────────────────────────────────────
// 3. 배차 확정 요청 규격 (웹의 DispatchConfirmRequest 대응)
// ────────────────────────────────────────────────
data class DispatchBasicRequest(
    val step: String = "BASIC",
    val deviceId: String,
    val order: SimplifiedOfficeOrder,
    val capturedAt: String,
    val matchType: String = "AUTO",
    val targetApp: String = "insung",
    /**
     * 👀 **미리보기 콜** — 기사님이 확정을 누르기 전에 팝업 3장을 읽어 판정만 받아 보는 콜
     * (기사님 확정 2026-08-22 · 용어집 §9). 아직 안 잡은 콜이라 인성에는 아무 일도
     * 일어나지 않았으므로 **서버가 취소 카운트에서 뺀다.**
     */
    val isPreview: Boolean = false
)

data class DispatchDetailedRequest(
    val step: String = "DETAILED",
    val deviceId: String,
    val order: DetailedOfficeOrder,
    val capturedAt: String,
    val matchType: String = "AUTO",
    val targetApp: String = "insung",
    /** 👀 미리보기 콜 — 뜻과 규칙은 `DispatchBasicRequest.isPreview` 에 적었다 */
    val isPreview: Boolean = false
)

// ────────────────────────────────────────────────
// 4. 서버 응답 규격 (웹의 DispatchConfirmResponse 대응)
// ────────────────────────────────────────────────
data class DispatchConfirmResponse(
    val deviceId: String = "",
    val action: String = "",  // "KEEP", "CANCEL", or "ACK"
    val orderId: String? = null
)

// ────────────────────────────────────────────────
// 5. 스크랩 벌크 전송 규격 (서버의 /api/scrap POST 대응)
// ────────────────────────────────────────────────
data class ScrapPayload(
    val deviceId: String,
    val data: List<SimplifiedOfficeOrder>,
    val screenContext: String? = null,  // [Safety Mode V3] 현재 화면 상태 (물리적 페이지)
    val isHolding: Boolean = false,     // [Page/Hold 분리] 콜 처리 중 여부
    val lat: Double? = null,            // [GPS 텔레메트리] 앱폰(차량) 위도
    val lng: Double? = null,            // [GPS 텔레메트리] 앱폰(차량) 경도
    val ackDecisionId: String? = null,  // [Piggyback] 수신 확인 응답용 ID
    val targetApp: String = "insung",   // 타겟 앱 (insung, hwamul24 등)
    // 🧭 [피기백 v2] 지금 들고 있는 필터의 버전 — 서버가 같으면 필터 본문을 생략한다.
    //    구서버는 이 필드를 무시하고 늘 전부 보낸다 (호환)
    val filterVersion: String? = null,
    /**
     * 👁️ **마지막 리스트 화면에서 읽은 텍스트 노드 수** (2026-08-22 · 크리티컬).
     *
     * 🔴 `data` 가 0건인 것만으로는 **리스트가 빈 것**과 **못 읽는 것**을 못 가른다.
     *    기사님이 겪은 일: 접근성이 막혀 콜을 하나도 못 읽는데 **관제웹은 파란불**이었다.
     *    텔레메트리는 계속 갔고 화면 판별도 됐기 때문이다.
     *
     * 이 숫자가 그 둘을 가른다 — **0이면 접근성 트리가 안 오는 것**이고, 값이 있는데
     * 콜이 0건이면 리스트가 비었거나 파서가 못 뽑는 것이다.
     * ⚠️ 선택 필드다 — 옛 서버는 무시하고, 갱신 안 된 APK 는 안 보낸다.
     */
    val screenNodeCount: Int? = null,
    /**
     * 💤 **폰 화면이 켜져 있는가** (기사님 확정 2026-08-22).
     *
     * 접근성 스크래핑은 화면이 켜져 있어야 배차망을 읽는다 — 꺼지면 **콜을 못 잡는다.**
     * 예전에는 `Screen Off` 이벤트로 한 번 알리고 끝이라, 60초 뒤 하트비트가
     * `ONLINE` 으로 되돌려 관제웹이 녹색이 됐다. 사실을 매번 실어 보낸다.
     * ⚠️ 선택 필드 — 옛 서버는 무시하고, 갱신 안 된 APK 는 안 보낸다.
     */
    val isScreenOn: Boolean? = null,
    /**
     * 👁️ **마지막 스캔에서 축별로 몇 개가 떨어졌나** (기사님 확정 2026-08-23).
     *
     * 기사님: *"관제웹에서는 필터링이 잘되고 있는 건지 알 수가 없어서 답답하다."*
     * `data` 건수는 *"앱이 살아 있다"* 까지만 말한다. **왜 하나도 안 잡는지**는 이 값이 말한다.
     * ⚠️ 선택 필드 — 옛 서버는 무시한다.
     */
    val filterTally: FilterTally? = null
)

/**
 * 👁️ **필터 성적표 — 마지막 스캔 한 판** (기사님 확정 2026-08-23).
 *
 * 리스트를 한 번 훑을 때마다 **새로 만들어** 채운다. 누적이 아니다 —
 * *"어제부터 300개 떨어짐"* 은 지금 상태를 못 알려 준다. 질문은
 * *"지금 리스트에 뭐가 떠 있고 왜 안 잡나"* 다.
 *
 * 🔴 **한 콜은 첫 번째로 걸린 축에만 센다.** 여러 축에 걸린 콜을 다 세면 합이
 *    `seen` 을 넘고, *"이 축을 풀면 몇 개가 들어오나"* 를 못 읽는다 — 그게 이 숫자의 쓸모다.
 *    순서는 화면의 판정 순서와 같다: 차종 → 도착지 → 요금 → 상차지 → 블랙 → 경로순서.
 *
 * 🔴 **파서가 들고 있지 않는다.** 호출자가 만들어 넘기고 파서는 채우기만 한다 —
 *    파서 안에 두면 언제 갱신되는지가 호출 순서에 달린다 (숨은 상태).
 */
data class FilterTally(
    /** 이번 스캔에서 판정한 콜 수 (요금을 못 읽어 버려진 카드는 여기 안 든다) */
    var seen: Int = 0,
    /** 전부 통과한 콜 수 */
    var passed: Int = 0,
    var vehicle: Int = 0,
    var region: Int = 0,
    var fare: Int = 0,
    var pickup: Int = 0,
    var blacklist: Int = 0,
    var routeOrder: Int = 0,
)

// 서버 응답 (Piggyback 통신: 상태, 통계, 제어명령, 최신 필터를 구조화하여 한 번에 태워보냄)
data class ScrapResponse(
    val success: Boolean,
    val apiStatus: ApiStatus,
    val deviceControl: DeviceControl,
    val dispatchEngineArgs: FilterConfig?,
    val decision: DecisionPayload? = null,
    // 🧭 [피기백 v2] 서버가 계산한 필터 버전 — dispatchEngineArgs 와 함께 저장해 뒀다가
    //    다음 텔레메트리에 실어 보낸다. 구서버 응답에는 없다(null) → 늘 전체 수신 (호환)
    val filterVersion: String? = null
)

data class DecisionPayload(
    val orderId: String,
    val action: String
)

data class ApiStatus(
    val success: Boolean = false,
    val totalItems: Int = 0
)

data class DeviceControl(
    val mode: String = "MANUAL"
)

// ────────────────────────────────────────────────
// 6. 관제탑 필터 규격 (웹의 FilterConfig 대응)
// ────────────────────────────────────────────────
/**
 * 서버가 내려주는 콜 잡기 명령서.
 *
 * ⚠️ 여기 기본값은 **서버 응답이 없거나 깨졌을 때만** 쓰인다.
 *    정상 흐름에서는 서버가 모든 값을 채워 보낸다.
 *    그래서 기본값은 "편한 값"이 아니라 **안전한 값**이어야 한다.
 *
 * 🔴 2026-08-12 — 예전 기본값이 위험한 쪽이었다.
 *      isActive = true   → 서버가 죽어도 **필터 없이 계속 콜 잡기**했다
 *      minFare  = 0      → 요금 하한이 사라져 똥콜까지 잡았다
 *    서버는 둘 다 반대(false / 30000)였는데 앱만 반대 방향을 보고 있었다.
 *    통신이 끊겼을 때 **멈추는 쪽**이 맞다 — 잘못 잡은 콜은 패널티가 붙는다.
 */
data class FilterConfig(
    val allowedVehicleTypes: List<String> = emptyList(),  // 빈 배열 = 모든 차종
    /** 통신이 끊기면 콜 잡기을 멈춘다. 서버가 명시적으로 켜 줘야 돈다 */
    val isActive: Boolean = false,
    val isSharedMode: Boolean = false,
    // ── 이하 기본값은 서버 미응답 시 최후 안전망 (서버 기본값과 같은 값으로 맞춘다) ──
    val pickupRadiusKm: Int = 10,
    /** 서버 기본값과 동일. 0 으로 두면 하한이 사라져 아무 콜이나 잡는다 */
    val minFare: Int = 30000,
    val maxFare: Int = 1000000,
    /**
     * 차종별 하한 단가(원/km) — 단가 판정 모델 (docs/지금/필터.md).
     * 판정: fare ≥ deliveryDistance × ratePerKm[차종]
     * 비어 있으면(서버가 구버전이거나 미응답) minFare 판정으로 동작한다 — 오프라인 안전망.
     */
    val ratePerKm: Map<String, Int> = emptyMap(),
    val destinationCity: String = "",
    val destinationRadiusKm: Int = 10,
    val excludedKeywords: List<String> = emptyList(),
    val destinationKeywords: List<String> = emptyList(),
    val customCityFilters: List<String> = emptyList(),
    val destinationGroups: Map<String, List<String>> = emptyMap(),
    /**
     * 🧭 동마다 "경로 출발점에서 몇 km 지점인가" — 역주행·경로 밖 상차 차단용
     * (기사님 확정 2026-08-18). null = 경로 위지만 순서를 모름(막지 않는다).
     * 비어 있으면(첫짐·구서버) 순서 검사를 하지 않는다 — 오프라인 안전망과 같은 방향.
     */
    val orderKm: Map<String, Double?> = emptyMap(),
    /**
     * 🗺️ 키워드 트랩 — 키워드로 시작하는 더 긴 다른 지명 (예: 남동 → [남동구]).
     * 부분 문자열 오탐 방지(RegionMatch ④). 비어 있으면(구서버) 문법 안전망만 돈다.
     */
    val keywordTraps: Map<String, List<String>> = emptyMap(),
)

// ────────────────────────────────────────────────
// 7. 기기 PIN 연동 (POST /api/devices/pair 대응)
// ────────────────────────────────────────────────
data class PairDeviceRequest(
    val pin: String,
    val deviceId: String,
    val deviceName: String? = null
)

data class PairDeviceResponse(
    val success: Boolean = false,
    val message: String? = null,
    val error: String? = null
)

