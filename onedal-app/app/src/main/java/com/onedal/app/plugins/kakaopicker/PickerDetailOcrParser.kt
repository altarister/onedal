package com.onedal.app.plugins.kakaopicker

import android.graphics.Bitmap
import com.onedal.app.core.OcrLine
import com.onedal.app.core.ScreenOcrParser
import com.onedal.app.models.SimplifiedOfficeOrder
import com.onedal.app.core.ScreenWords
import com.onedal.app.core.WordKind
import com.onedal.app.models.withReservation

/**
 * 📷 **카카오 픽커 상세 화면 OCR 파서 및 검증 구현체**
 *
 * - 자르기(crop): 상단 40% 지도 영역을 잘라내고 하단 60% 상세 전표 영역만 추출
 * - 줄 나누기(parse): PickerScreenOcr.parseDetail 로 픽업지/배송지/물품정보 추출
 * - 조립(verify): 사진 주소(행정동 + 건물명)를 콜에 싣고, 수동 콜은 요금을 복원한다(#119 수호). «누른 그 콜인가»는 공통 `TappedCall`
 */
class PickerDetailOcrParser : com.onedal.app.core.DetailVerifier<PickerDetailFromImage> {

    companion object {
        /**
         * 🏠 **서버에 올릴 전체 주소 = 행정동 주소 + 건물명** — 서버가 건물명을 따로 꺼내지 않는다(원달앱이 상세 데이터에 전체 주소를 싣는다).
         * 건물명이 있으면 지오코딩이 동 중심이 아니라 그 건물로 간다. 없으면 행정동 주소만.
         */
        fun fullAddress(stop: PickerStopFromImage): String = listOfNotNull(stop.admin, stop.place).joinToString(" ")

        /**
         * 💰 화면 텍스트에서 요금(예: "9,693P", "9693P", "15,000원") 추출
         */
        fun extractFareFromTexts(texts: List<String>): Int {
            // «최종 수익» — 숫자가 옆 노드로 따로 온다(실물 덤프 13:40) · 규칙은 `PickerFinalIncome` 한 벌
            PickerFinalIncome.of(texts)?.let { return it }
            val fareRe = Regex("([0-9]{1,3}(?:,[0-9]{3})+|[0-9]{3,})\\s*(?:P|p|원)")
            for (text in texts) {
                val match = fareRe.find(text)
                if (match != null) {
                    val num = match.groupValues[1].replace(",", "").toIntOrNull()
                    if (num != null && num > 0) return num
                }
            }
            return 0
        }
    }

    override fun crop(screen: Bitmap): Bitmap {
        val top = (screen.height * 0.4).toInt()
        return Bitmap.createBitmap(screen, 0, top, screen.width, screen.height - top)
    }

    override fun parse(lines: List<OcrLine>): PickerDetailFromImage? {
        return PickerScreenOcr.parseDetail(lines)
    }

    /** 📸 판독 실패 까닭 — 없는 머리를 이름으로, 머리가 다 있으면 주소 줄 */
    override fun failureReason(lines: List<OcrLine>): String {
        val missing = PickerScreenOcr.missingHeads(lines)
        return if (missing.isEmpty()) "행정동 줄 없음" else missing.joinToString("·") + " 머리 없음"
    }

    /** 📸 공통 규격(`DetailVerifier`) — 대조 결과의 콜 */
    override fun verifyOrder(
        parsed: PickerDetailFromImage,
        tappedCard: SimplifiedOfficeOrder?,
        matchedListOrder: SimplifiedOfficeOrder?,
        screenTexts: List<String>,
        rawScreenStr: String,
        recent: List<SimplifiedOfficeOrder>,
    ): SimplifiedOfficeOrder = when (val r = verify(parsed, tappedCard, matchedListOrder, screenTexts, rawScreenStr, recent)) {
        is VerifyResult.Success -> r.order
    }

    sealed class VerifyResult {
        data class Success(val order: SimplifiedOfficeOrder, val detail: PickerDetailFromImage) : VerifyResult()
    }

    /**
     * 🎯 OCR 판독 결과와 리스트 카드를 대조하여 검증된 오더를 조립한다.
     * - 알람 콜(`alarmTappedCard != null`): 누른 줄에 사진 주소를 싣는다 — «누른 그 콜인가»는 공통 검증(`TappedCall`)이 본다
     * - 수동 콜(`alarmTappedCard == null`): 리스트 매칭 카드로 요금을 복원하고 OCR 결과로 오더 조립 (#119 수호)
     */
    fun verify(
        parsed: PickerDetailFromImage,
        alarmTappedCard: SimplifiedOfficeOrder?,
        matchedListOrder: SimplifiedOfficeOrder?,
        screenTexts: List<String>,
        rawScreenStr: String,
        recent: List<SimplifiedOfficeOrder> = emptyList(),
    ): VerifyResult {
        // 📰 사진에서 칸에 안 넣은 줄 — 상세 페이지의 «정의에 없음»으로 모은다 (reviews/24 · `ScreenWords`)
        val photoSample = parsed.unreadLines.joinToString(" ")
        parsed.unreadLines.forEach { ScreenWords.add(it, WordKind.UNKNOWN, photoSample, page = com.onedal.app.core.Page.DETAIL) }   // 📸 찍은 화면(상세)으로 — 판독이 끝날 때 화면이 바뀌어 있어도
        if (alarmTappedCard != null) {
            val verifiedOrder = alarmTappedCard.copy(
                fare = detailFare(alarmTappedCard.fare, parsed.finalIncome) ?: alarmTappedCard.fare,
                pickup = fullAddress(parsed.pickup),
                dropoff = fullAddress(parsed.dropoff),
                rawText = rawScreenStr,
                itemSize = parsed.itemSize ?: alarmTappedCard.itemSize
            ).withReservation(detailReservation(parsed))
            return VerifyResult.Success(verifiedOrder, parsed)
        } else {
            // 🧾 상세 글자로 못 가르면 사진의 상차·하차·픽업 km 로 한 번 더 — 꼭 한 줄일 때만 (`photoMatchCard`)
            val fareUnread = parsed.finalIncome == null
            val baseOrder = matchedListOrder ?: KakaoPickerParser.photoMatchCard(parsed.pickup, parsed.dropoff, recent, fareUnread)
            // 🍷 쌍둥이 콜의 낮은 요금으로 골랐으면 꼬리 글(이미 있는 tagsText 칸 · 서버 판정 규칙은 이 칸을 안 읽는다)
            //    목록 줄로 찾았든 사진으로 찾았든 같은 꼬리 글 (`twinNoteOf` 한 벌)
            val twinNote = if (fareUnread) KakaoPickerParser.twinNoteOf(baseOrder, recent) else null
            // 🧾 손으로 연 상세의 대조 — 요금이 비는 까닭을 로그로 가른다 (실물 09-30 13:25 #42·#45)
            com.onedal.app.core.AppLogger.d("1DAL_PRE_CONFIRM", com.onedal.app.core.LogTag.CALL_STAGE,
                "🧾 [손 상세 대조] 목록: ${if (matchedListOrder != null) "찾음" else "못 찾음"} · 사진: " +
                    KakaoPickerParser.photoMatchReport(parsed.pickup, parsed.dropoff, recent, fareUnread) +
                    " · 사진 최종 수익 ${parsed.finalIncome ?: "없음"}")
            // 요금: 사진의 «최종 수익» → 목록 줄 → 상세 글자 (`detailFare` · 손으로 연 상세는 목록 줄이 없을 수 있다)
            val resolvedFare = detailFare(baseOrder?.fare, parsed.finalIncome) ?: extractFareFromTexts(screenTexts)

            val now = java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", java.util.Locale.US).apply {
                timeZone = java.util.TimeZone.getTimeZone("UTC")
            }.format(java.util.Date())

            val manualOrder = baseOrder?.copy(
                id = baseOrder.id.ifEmpty { "MANUAL-${System.currentTimeMillis()}" },
                type = "MANUAL_CLICK",
                pickup = fullAddress(parsed.pickup),
                dropoff = fullAddress(parsed.dropoff),
                fare = resolvedFare,
                timestamp = now,
                rawText = rawScreenStr,
                itemSize = parsed.itemSize ?: baseOrder.itemSize,
                vehicleType = KakaoPickerKeywords.PICKER_ASSUMED_VEHICLE,
                tagsText = listOfNotNull(parsed.itemSize, KakaoPickerKeywords.PICKER_VEHICLE_UNKNOWN_TAG).joinToString(" ") +
                    (twinNote?.let { " · $it" } ?: "")
            ) ?: SimplifiedOfficeOrder(
                id = "MANUAL-${System.currentTimeMillis()}",
                type = "MANUAL_CLICK",
                pickup = fullAddress(parsed.pickup),
                dropoff = fullAddress(parsed.dropoff),
                fare = resolvedFare,
                timestamp = now,
                rawText = rawScreenStr,
                itemSize = parsed.itemSize,
                vehicleType = KakaoPickerKeywords.PICKER_ASSUMED_VEHICLE,
                tagsText = listOfNotNull(parsed.itemSize, KakaoPickerKeywords.PICKER_VEHICLE_UNKNOWN_TAG).joinToString(" ") +
                    (twinNote?.let { " · $it" } ?: "")
            )
            return VerifyResult.Success(manualOrder.withReservation(detailReservation(parsed)), parsed)
        }
    }

    /**
     * 💰 **판정 요금 — 사진의 «최종 수익»이 있으면 그것, 없으면 목록 줄 요금** (기사님 «가» · `PickerFinalFareTest`).
     * 픽커는 시간이 지나며 요금을 올려 목록 줄 요금과 다를 수 있다 — 두 값이 다르면 한 줄. 목록 줄(본 콜 기억 지문)은 바꾸지 않는다.
     * 알람 필터(목록 단계)는 목록 요금 그대로, 채운 뒤 필터·서버 판정은 이 값.
     */
    /** 이만큼(배) 넘게 다르면 숫자 한 자리가 빠지거나 붙은 오독이다 — 열 배에 여유를 둔 값 */
    private val DIGIT_SLIP = 8

    private fun detailFare(listFare: Int?, finalIncome: Int?): Int? {
        val list = listFare?.takeIf { it > 0 }
        val fin = finalIncome?.takeIf { it > 0 } ?: return list
        // 🔢 열 배 차이(사진 숫자 한 자리 빠짐·붙음 · «13,020»→«1302»)는 오독으로 본다 — 판정이 열 배 틀리지 않게.
        //    두 배 인상은 믿는다(픽커가 실제로 올린다). 목록 요금이 없으면(손 상세 · 목록 못 찾음) 최종 수익 그대로
        if (list != null && (fin.toLong() * DIGIT_SLIP <= list || list.toLong() * DIGIT_SLIP <= fin)) {
            com.onedal.app.core.AppLogger.w("1DAL_PRE_CONFIRM", com.onedal.app.core.LogTag.CALL_STAGE,
                "💰 [요금] 최종 수익 ${"%,d".format(fin)} 이 목록 ${"%,d".format(list)} 과 너무 달라 목록 값 — 사진 숫자 오독으로 본다")
            return list
        }
        if (list != null && list != fin && com.onedal.app.core.LogOnce.changed("detail-fare:$list", "$fin"))
            com.onedal.app.core.AppLogger.i("1DAL_PRE_CONFIRM", com.onedal.app.core.LogTag.CALL_STAGE,
                "💰 [요금] 목록 ${"%,d".format(list)} → 최종 수익 ${"%,d".format(fin)}")
        return fin
    }

    /**
     * 📅 **상세 사진의 예약이 목록 값을 덮는다** — «오늘 17:00 픽업예약» 띠 줄을 먼저 읽고, 띠에서 날·시각을 못 읽을 때만
     * 상차 정거장 시각(«내일 14:00»)으로. 띠가 없으면 예약이 아니다 (`PickerReservationTest` · `PickerReservedBandTest`).
     * 🔴 띠가 «오늘»이면 픽업 줄은 «17:00까지 픽업»(날 없음)이라 픽업 줄만 보면 «날 모름»으로 오늘 콜을 막는다(실물 09-30 14:21).
     */
    private fun detailReservation(parsed: PickerDetailFromImage): com.onedal.app.core.Reservation {
        if (!parsed.reserved) return com.onedal.app.core.Reservation.NONE
        val now = java.time.LocalDateTime.now()
        val band = parsed.reservedLine?.let { com.onedal.app.core.ReservationText.read(it, now) }
        if (band != null && band.day != null && band.at != null) return band
        return com.onedal.app.core.ReservationText.read("예약 ${parsed.pickup.at.orEmpty()}", now)
    }
}
