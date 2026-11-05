package com.onedal.app.models

// 🔴 생성 파일 — shared/src/call/orderShapes.ts 의 기본 콜 타입에서 뽑는다. 손으로 고치지 말고 cd onedal-web && pnpm gen:pages basecall
// 플러그인이 채워 보내는 모양이다. 글자 묶음 별칭(MoneyKind · 결제 등)은 글자로 보낸다.

/** 기본 콜 결제 칸에 담는 값 */
val CALL_PAYMENT_TYPES = setOf("신용", "선불", "착불", "카드", "현금", "선/착불")

/** 기본 콜 계산서 칸에 담는 값 */
val CALL_BILLING_TYPES = setOf("계산서", "인수증", "무과세")

/** 🎯 기본 콜 — 콜 한 건을 퀵 기사가 묻는 차례대로 나눈 것 */
data class BaseCall(
    val id: String,
    val targetApp: String,
    val dispatcherName: String? = null,
    val dispatcherPhone: String? = null,
    val requesterName: String? = null,
    val fromOtherOffice: Boolean? = null,
    val orderNo: String? = null,
    val clientOrderNo: String? = null,
    val stage: String? = null,
    val route: CallRoute,
    val money: CallMoney,
    val load: CallLoad,
    val time: CallTime,
    val job: CallJob,
)

/** 어디서 어디로 가나 — 내비에 찍고 전화를 건다 */
data class CallRoute(
    val listRegion: CallRouteListRegion? = null,
    val pickup: CallStop,
    val dropoff: CallStop,
    val viaDropoffs: List<CallStop>? = null,
    val pickupDistance: Double? = null,
    val deliveryDistance: Double? = null,
)

data class CallRouteListRegion(
    val pickup: String? = null,
    val dropoff: String? = null,
)

/** 정거장 한 곳 — 기존 타입에 상하차 방법을 더하고, 읽는 곳이 없는 마일리지 · 요청 시각을 뺀다 */
data class CallStop(
    val customerName: String? = null,
    val department: String? = null,
    val contactName: String? = null,
    val phone1: String? = null,
    val phone2: String? = null,
    val region: String? = null,
    val addressDetail: String? = null,
    val memo: String? = null,
    val loadingMethod: String? = null,
)

/** 얼마 버나, 어떻게 받나 — 합치거나 빼지 않고 화면의 금액을 줄로 둔다 */
data class CallMoney(
    val lines: List<MoneyLine>,
    val paymentType: String? = null,
    val billingType: String? = null,
)

/** 화면의 금액 한 줄 */
data class MoneyLine(
    val kind: String,
    val won: Double? = null,
    val rate: String? = null,
    val label: String? = null,
)

/** 뭘 싣나 — 배차망이 말한 그대로 둔다. 실리는지는 BaseCallFacts.load 가 답한다 */
data class CallLoad(
    val vehicleType: String? = null,
    val itemSize: String? = null,
    val itemDescription: String? = null,
    val weightKg: Double? = null,
    val sizeCm: Double? = null,
    val passengerCount: Double? = null,
    val careTags: List<String>? = null,
)

/** 언제까지 가야 하나 */
data class CallTime(
    val pickup: CallPromise? = null,
    val dropoff: CallPromise? = null,
    val returnPickup: CallPromise? = null,
    val remaining: String? = null,
    val postTime: String? = null,
)

/** 약속 한 건 — 상차와 하차가 같은 모양이다 */
data class CallPromise(
    val text: String? = null,
    val reserved: Boolean? = null,
    val day: Double? = null,
    val at: String? = null,
    val after: String? = null,
    val by: String? = null,
)

/** 조건은 뭔가, 가서 뭘 해야 하나 */
data class CallJob(
    val tripType: String? = null,
    val orderForm: String? = null,
    val tagsText: String? = null,
    val detailMemo: String? = null,
)

/** 🔴 기록 — 콜 값과 다른 JSON 칸에 저장하고 소켓에 안 싣는다. 목록 글자 통째도 여기 남는다. 읽을 때마다 한 줄 더하고 덮지 않는다. 목록 줄 역사는 지금처럼 intel 표가 갖는다 */
data class CallEvidence(
    val seen: List<EvidenceLine>,
)

/** 화면을 한 번 읽은 기록 */
data class EvidenceLine(
    val at: String,
    val screen: String? = null,
    val read: String? = null,
    val rawText: String? = null,
    val changed: List<EvidenceLineChanged>? = null,
)

data class EvidenceLineChanged(
    val field: String,
    val from: String? = null,
    val to: String? = null,
)
