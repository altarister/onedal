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
    LIST("LIST"),                          // 사냥 리스트 화면
    DETAIL_PRE_CONFIRM("DETAIL_PRE_CONFIRM"),  // 광클 직전 상세
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
    val timestamp: String
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
    val pickupDistance: Double? = null
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
    val paymentType: String? = null,     // "신용", "착불", "선불" 등
    val billingType: String? = null,     // "계산서", "인수증", "무과세"
    val vehicleType: String? = null,     // "다마스", "1톤카고" 등
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
    val matchType: String = "AUTO"
)

data class DispatchDetailedRequest(
    val step: String = "DETAILED",
    val deviceId: String,
    val order: DetailedOfficeOrder,
    val capturedAt: String,
    val matchType: String = "AUTO"
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
    val lng: Double? = null             // [GPS 텔레메트리] 앱폰(차량) 경도
)

// 서버 응답 (Piggyback 통신: 상태, 통계, 제어명령, 최신 필터를 구조화하여 한 번에 태워보냄)
data class ScrapResponse(
    val apiStatus: ApiStatus,
    val deviceControl: DeviceControl,
    val dispatchEngineArgs: Map<String, Any>? = null
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
data class FilterConfig(
    val allowedVehicleTypes: List<String> = emptyList(),  // 빈 배열 = 모든 차종
    val isActive: Boolean = true,
    val isSharedMode: Boolean = false,
    val pickupRadiusKm: Int = 999,
    val minFare: Int = 0,
    val maxFare: Int = 1000000,
    val destinationCity: String = "",
    val destinationRadiusKm: Int = 10,
    val excludedKeywords: List<String> = emptyList(),
    val destinationKeywords: List<String> = emptyList(),
    val customCityFilters: List<String> = emptyList(),
    val destinationGroups: Map<String, List<String>> = emptyMap(),
    val customFilters: List<String> = emptyList()
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

