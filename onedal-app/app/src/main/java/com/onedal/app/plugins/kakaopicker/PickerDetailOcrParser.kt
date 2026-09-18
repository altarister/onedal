package com.onedal.app.plugins.kakaopicker

import android.graphics.Bitmap
import com.onedal.app.core.OcrLine
import com.onedal.app.core.ScreenOcrParser
import com.onedal.app.models.SimplifiedOfficeOrder

/**
 * 📷 **카카오 픽커 상세 화면 OCR 파서 및 검증 구현체**
 *
 * - 자르기(crop): 상단 40% 지도 영역을 잘라내고 하단 60% 상세 전표 영역만 추출
 * - 줄 나누기(parse): PickerScreenOcr.parseDetail 로 픽업지/배송지/물품정보 추출
 * - 검증/조립(verify): 알람 콜 동 토막 대조(matchDong) 및 수동 콜 요금 복원(#119 수호) 오더 조립
 */
class PickerDetailOcrParser : ScreenOcrParser<PickerDetailFromImage> {

    companion object {
        /**
         * 🎯 카드 주소와 OCR 행정동 대조: 마지막 토막(동/읍/면)이 반드시 행정동에 포함되어야 한다.
         * (예: "분당 야탑3" → "야탑3"이 "경기 성남시 분당구 야탑3동"에 포함됨)
         * 앞선 구 이름("분당")만으로 이웃 동("이매1동")이 오판 통과되는 것을 방어한다.
         */
        fun matchDong(cardText: String, adminText: String): Boolean {
            val tokens = cardText.split(' ', '·').map { it.trim() }.filter { it.length >= 2 }
            if (tokens.isEmpty()) return true
            val lastToken = tokens.last()
            val cleanDong = lastToken.removeSuffix("동").removeSuffix("읍").removeSuffix("면").removeSuffix("리")
            return if (cleanDong.length >= 2) {
                adminText.contains(cleanDong, ignoreCase = true)
            } else {
                adminText.contains(lastToken, ignoreCase = true)
            }
        }

        /**
         * 💰 화면 텍스트에서 요금(예: "9,693P", "9693P", "15,000원") 추출
         */
        fun extractFareFromTexts(texts: List<String>): Int {
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

    sealed class VerifyResult {
        data class Success(val order: SimplifiedOfficeOrder, val detail: PickerDetailFromImage) : VerifyResult()
        data class Mismatch(val reason: String, val detail: PickerDetailFromImage) : VerifyResult()
    }

    /**
     * 🎯 OCR 판독 결과와 리스트 카드를 대조하여 검증된 오더를 조립한다.
     * - 알람 콜(`alarmTappedCard != null`): 동 토막 엄격 대조 일치 시 성공, 불일치 시 Mismatch
     * - 수동 콜(`alarmTappedCard == null`): 리스트 매칭 카드로 요금을 복원하고 OCR 결과로 오더 조립 (#119 수호)
     */
    fun verify(
        parsed: PickerDetailFromImage,
        alarmTappedCard: SimplifiedOfficeOrder?,
        matchedListOrder: SimplifiedOfficeOrder?,
        screenTexts: List<String>,
        rawScreenStr: String
    ): VerifyResult {
        if (alarmTappedCard != null) {
            val pickupMatch = matchDong(alarmTappedCard.pickup, parsed.pickup.admin)
            val dropoffMatch = matchDong(alarmTappedCard.dropoff, parsed.dropoff.admin)

            return if (pickupMatch && dropoffMatch) {
                val verifiedOrder = alarmTappedCard.copy(
                    pickup = parsed.pickup.admin,
                    dropoff = parsed.dropoff.admin,
                    rawText = rawScreenStr,
                    itemSize = parsed.itemSize ?: alarmTappedCard.itemSize
                )
                VerifyResult.Success(verifiedOrder, parsed)
            } else {
                val reason = "주소 불일치 (기억: ${alarmTappedCard.pickup}→${alarmTappedCard.dropoff} / OCR: ${parsed.pickup.admin}→${parsed.dropoff.admin})"
                VerifyResult.Mismatch(reason, parsed)
            }
        } else {
            val baseOrder = matchedListOrder
            val resolvedFare = baseOrder?.fare?.takeIf { it > 0 } ?: extractFareFromTexts(screenTexts)

            val now = java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", java.util.Locale.US).apply {
                timeZone = java.util.TimeZone.getTimeZone("UTC")
            }.format(java.util.Date())

            val manualOrder = baseOrder?.copy(
                id = baseOrder.id.ifEmpty { "MANUAL-${System.currentTimeMillis()}" },
                type = "MANUAL_CLICK",
                pickup = parsed.pickup.admin,
                dropoff = parsed.dropoff.admin,
                fare = resolvedFare,
                timestamp = now,
                rawText = rawScreenStr,
                itemSize = parsed.itemSize ?: baseOrder.itemSize,
                vehicleType = KakaoPickerKeywords.PICKER_ASSUMED_VEHICLE,
                tagsText = listOfNotNull(parsed.itemSize, KakaoPickerKeywords.PICKER_VEHICLE_UNKNOWN_TAG).joinToString(" ")
            ) ?: SimplifiedOfficeOrder(
                id = "MANUAL-${System.currentTimeMillis()}",
                type = "MANUAL_CLICK",
                pickup = parsed.pickup.admin,
                dropoff = parsed.dropoff.admin,
                fare = resolvedFare,
                timestamp = now,
                rawText = rawScreenStr,
                itemSize = parsed.itemSize,
                vehicleType = KakaoPickerKeywords.PICKER_ASSUMED_VEHICLE,
                tagsText = listOfNotNull(parsed.itemSize, KakaoPickerKeywords.PICKER_VEHICLE_UNKNOWN_TAG).joinToString(" ")
            )
            return VerifyResult.Success(manualOrder, parsed)
        }
    }
}
