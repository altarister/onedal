package com.onedal.app.models

/**
 * 웹 관제탑(onedal-web/shared/src/index.ts)과 1:1 동기화된 Kotlin 데이터 모델입니다.
 * 앱 ↔ 서버 간 통신 규격의 단일 진실 공급원(Single Source of Truth)으로 사용됩니다.
 */

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
    val rawText: String? = null,
    val pickupX: Double? = null,
    val pickupY: Double? = null,
    val dropoffX: Double? = null,
    val dropoffY: Double? = null
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
    val action: String = ""  // "KEEP" or "CANCEL"
)

// ────────────────────────────────────────────────
// 5. 스크랩 벌크 전송 규격 (서버의 /api/scrap POST 대응)
// ────────────────────────────────────────────────
data class ScrapPayload(
    val deviceId: String,
    val data: List<SimplifiedOfficeOrder>
)

// 서버 응답 (Piggyback 통신: 상태, 통계, 최신 필터를 한 번에 태워보냄)
data class ScrapResponse(
    val success: Boolean = false,
    val total: Int = 0,
    val mode: String = "MANUAL",  // "AUTO" or "MANUAL"
    val filter: Map<String, Any>? = null
)
