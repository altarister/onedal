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
class PickerDetailOcrParser : ScreenOcrParser<PickerDetailFromImage> {

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
            // «최종 수익 11,249» — 원·P 가 안 붙는다 (실물 09-30 12:54 · 이상 기록 id 34 · 목록 대조와 같은 규칙)
            for (text in texts) {
                val v = KakaoPickerParser.DETAIL_FARE_REGEX.find(text)?.groupValues?.get(1)?.replace(",", "")?.toIntOrNull()
                if (v != null && v > 0) return v
            }
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
        parsed.unreadLines.forEach { ScreenWords.add(it, WordKind.UNKNOWN, photoSample) }
        if (alarmTappedCard != null) {
            val verifiedOrder = alarmTappedCard.copy(
                pickup = fullAddress(parsed.pickup),
                dropoff = fullAddress(parsed.dropoff),
                rawText = rawScreenStr,
                itemSize = parsed.itemSize ?: alarmTappedCard.itemSize
            ).withReservation(detailReservation(parsed))
            return VerifyResult.Success(verifiedOrder, parsed)
        } else {
            // 🧾 상세 글자로 못 가르면 사진의 상차·하차·픽업 km 로 한 번 더 — 꼭 한 줄일 때만 (`photoMatchCard`)
            val baseOrder = matchedListOrder ?: KakaoPickerParser.photoMatchCard(parsed.pickup, parsed.dropoff, recent)
            // 요금: 목록 줄 → 사진의 «최종 수익»(같은 높이 줄) → 상세 글자 (손으로 연 상세는 목록 줄이 없을 수 있다)
            val resolvedFare = baseOrder?.fare?.takeIf { it > 0 } ?: parsed.finalIncome ?: extractFareFromTexts(screenTexts)

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
                tagsText = listOfNotNull(parsed.itemSize, KakaoPickerKeywords.PICKER_VEHICLE_UNKNOWN_TAG).joinToString(" ")
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
                tagsText = listOfNotNull(parsed.itemSize, KakaoPickerKeywords.PICKER_VEHICLE_UNKNOWN_TAG).joinToString(" ")
            )
            return VerifyResult.Success(manualOrder.withReservation(detailReservation(parsed)), parsed)
        }
    }

    /**
     * 📅 **상세 사진의 예약이 목록 값을 덮는다** — «내일 14:00 픽업예약» 띠가 있으면 상차 정거장 시각(«내일 14:00»)으로,
     * 띠가 없으면 예약이 아니다(오늘 콜은 «10:00까지 픽업»으로 온다) (`PickerReservationTest`).
     */
    private fun detailReservation(parsed: PickerDetailFromImage): com.onedal.app.core.Reservation =
        if (parsed.reserved) com.onedal.app.core.ReservationText.read(
            "예약 ${parsed.pickup.at.orEmpty()}", java.time.LocalDateTime.now(), bareLaterTimeIsToday = false)
        else com.onedal.app.core.Reservation.NONE
}
