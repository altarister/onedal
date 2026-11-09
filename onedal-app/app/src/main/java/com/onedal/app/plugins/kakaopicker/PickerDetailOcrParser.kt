package com.onedal.app.plugins.kakaopicker

import android.graphics.Bitmap
import com.onedal.app.core.OcrLine
import com.onedal.app.core.ScreenOcrParser
import com.onedal.app.models.SimplifiedOfficeOrder
import com.onedal.app.core.ScreenWords
import com.onedal.app.core.WordKind
import com.onedal.app.models.withPromises
import com.onedal.app.core.Reservation
import com.onedal.app.core.ReservationText
import com.onedal.app.core.withFirstPickup
import com.onedal.app.core.firstPickupStop
import com.onedal.app.core.withLastDropoff
import com.onedal.app.core.withStopKm
import com.onedal.app.models.CallStop

/**
 * 📷 **카카오 픽커 상세 화면 OCR 파서 및 검증 구현체**
 *
 * - 자르기(crop): 상단 40% 지도 영역을 잘라내고 하단 60% 상세 전표 영역만 추출
 * - 줄 나누기(parse): PickerScreenOcr.parseDetail 로 픽업지/배송지/물품정보 추출
 * - 조립(verify): 사진 주소(행정동 → 상세 주소 · 건물명 → 상호 칸)를 콜에 싣고, 수동 콜은 요금을 복원한다(#119 수호). «누른 그 콜인가»는 공통 `TappedCall`
 */
class PickerDetailOcrParser : com.onedal.app.core.DetailVerifier<PickerDetailFromImage> {

    companion object {
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
        // 📰 사진에서 칸에 안 넣은 줄 — 상세 페이지의 «정의에 없음»으로 모은다 (`ScreenWords`)
        val photoSample = parsed.unreadLines.joinToString(" ")
        parsed.unreadLines.forEach { ScreenWords.add(it, WordKind.UNKNOWN, photoSample, page = com.onedal.app.core.Page.NEW_CALL) }   // 📸 찍은 화면(상세)으로 — 판독이 끝날 때 화면이 바뀌어 있어도
        // 🚚 짐 묶음 — 사진 시트 꼬리표의 차종 글자(«승용차»)와 물품 줄의 크기 낱말 · 화면에 없으면 목록 줄의 것 · 차종을 지어내지 않는다
        val photoVehicle = parsed.unreadLines.flatMap { it.split(' ') }.firstOrNull { it in KakaoPickerPages.vehicleWords }
        val photoSize = PickerScreenOcr.sizeWordOf(parsed.itemSize)
        if (alarmTappedCard != null) {
            val verifiedOrder = withPhotoStops(withIncomeLine(alarmTappedCard.copy(
                fare = detailFare(alarmTappedCard.fare, parsed.finalIncome) ?: alarmTappedCard.fare,
                rawText = rawScreenStr,
                itemSize = parsed.itemSize ?: alarmTappedCard.itemSize,
                loadVehicleText = photoVehicle ?: alarmTappedCard.load?.vehicleText,
                loadSizeText = photoSize ?: alarmTappedCard.load?.sizeText,
            )), parsed).let { withDetailPromises(it, parsed) }
            return VerifyResult.Success(verifiedOrder, parsed)
        } else {
            // 🧾 상세 글자로 못 가르면 사진의 상차·하차·픽업 km 로 한 번 더 — 꼭 한 줄일 때만 (`photoMatchCard`)
            val fareUnread = parsed.finalIncome == null
            val baseOrder = matchedListOrder ?: KakaoPickerParser.photoMatchCard(parsed.pickup, parsed.dropoff, recent, fareUnread)
            // 🍷 쌍둥이 콜의 낮은 요금으로 골랐으면 꼬리 글(이미 있는 tagsText 칸 · 서버 판정 규칙은 이 칸을 안 읽는다)
            //    목록 줄로 찾았든 사진으로 찾았든 같은 꼬리 글 (`twinNoteOf` 한 벌)
            val twinNote = if (fareUnread) KakaoPickerParser.twinNoteOf(baseOrder, recent) else null
            // 🧾 손으로 연 상세의 대조 — 요금이 비는 까닭을 로그로 가른다 (실물 #42·#45)
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
                fare = resolvedFare,
                timestamp = now,
                rawText = rawScreenStr,
                itemSize = parsed.itemSize ?: baseOrder.itemSize,
                loadVehicleText = photoVehicle ?: baseOrder.load?.vehicleText,
                loadSizeText = photoSize ?: baseOrder.load?.sizeText,
                tagsText = tagsOf(parsed.itemSize, twinNote)
            ) ?: SimplifiedOfficeOrder(
                id = "MANUAL-${System.currentTimeMillis()}",
                type = "MANUAL_CLICK",
                pickupDetails = listOf(CallStop()),
                dropoffDetails = listOf(CallStop()),
                fare = resolvedFare,
                timestamp = now,
                rawText = rawScreenStr,
                itemSize = parsed.itemSize,
                loadVehicleText = photoVehicle,
                loadSizeText = photoSize,
                tagsText = tagsOf(parsed.itemSize, twinNote)
            )
            return VerifyResult.Success(withDetailPromises(withPhotoStops(withIncomeLine(manualOrder), parsed), parsed), parsed)
        }
    }

    /** 🏷️ 손으로 연 상세의 화면 기록 — 물품 크기 줄 · 쌍둥이 꼬리 글(« · » 뒤) · 둘 다 없으면 null */
    private fun tagsOf(itemSize: String?, twinNote: String?): String? =
        listOfNotNull(itemSize, twinNote).joinToString(" · ").ifEmpty { null }

    /**
     * 💰 **판정 요금 — 사진의 «최종 수익»이 있으면 그것, 없으면 목록 줄 요금** (기사님 «가» · `PickerFinalFareTest`).
     * 픽커는 시간이 지나며 요금을 올려 목록 줄 요금과 다를 수 있다 — 두 값이 다르면 한 줄. 목록 줄(본 콜 기억 지문)은 바꾸지 않는다.
     * 알람 필터(목록 단계)는 목록 요금 그대로, 채운 뒤 필터·서버 판정은 이 값.
     */
    /** 이만큼(배) 넘게 다르면 숫자 한 자리가 빠지거나 붙은 오독이다 — 열 배에 여유를 둔 값 (서버 /detail 돈 합치기 shared `DIGIT_SLIP` 과 같은 값) */
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
     * 💰 **기사님 몫 줄 하나** (돈 결정 8) — 판정 요금(최종 수익 또는 목록 요금 · 쌍둥이는 낮은 줄 요금)과 같은 값.
     * 목록 줄 기사님 몫과 같은 금액이면 그 줄의 화면 글자, 아니면(최종 수익) 쉼표 숫자 · 쌍둥이 꼬리 글은 `tagsText` 그대로.
     */
    private fun withIncomeLine(order: SimplifiedOfficeOrder): SimplifiedOfficeOrder {
        if (order.fare <= 0) return order.copy(money = null)
        val listed = order.money?.lines?.firstOrNull { it.kind == com.onedal.app.models.MoneyLine.INCOME }
        return order.copy(money = listed?.takeIf { it.won == order.fare }?.let { com.onedal.app.models.CallMoney.ofIncome(it.won, it.shown) }
            ?: com.onedal.app.models.CallMoney.ofIncome(order.fare))
    }

    /**
     * 🏠 사진의 상차 · 하차 정거장을 첫 상차 · 마지막 하차 정거장에 싣는다 — 목록 원문(`listText`)은 그대로.
     * 📏 사진 «픽업 Nkm» · «배송 Nkm»(직선)은 정거장 거리 — 목록 값이 없을 때만(목록에는 배송 거리가 없어 하차 거리는 여기서 처음 선다).
     */
    private fun withPhotoStops(order: SimplifiedOfficeOrder, parsed: PickerDetailFromImage): SimplifiedOfficeOrder =
        withStopKm(withLastDropoff(withFirstPickup(order) { it.fromPhoto(parsed.pickup) }) { it.fromPhoto(parsed.dropoff) },
            parsed.pickup.straightKm, parsed.dropoff.straightKm)

    /**
     * 🏠 **사진 정거장 한 곳 → 정거장 칸** — 행정동 주소는 상세 주소(`addressDetail`), 회색 상호는 상호 칸(`customerName` · 없으면 null).
     * 판정 글자(`StopText.query`)가 번지 없는 주소 뒤에 상호를 잇는다 — 지오코딩이 동 중심이 아니라 그 건물로 간다.
     */
    private fun CallStop.fromPhoto(stop: PickerStopFromImage): CallStop = copy(addressDetail = stop.admin, customerName = stop.place)

    /**
     * 📅 **목록 «예약 …» 낱말과 상세 사진의 시각을 합친다** (약속 정해진 것 7 · `PickerReservationTest` · `PickerReservedBandTest`).
     * - 상차 날 = 띠 «내일 15:00 픽업예약»의 날 > 목록 날 낱말(«예약 내일») > 첫 정거장 날(«내일 15:00») > 오늘(0)
     * - 상차 시각 = 띠 시각 > 첫 정거장 시각(«17:04까지 픽업» 포함) > 목록 시각
     * - 하차 = 둘째 정거장 «19:22까지 배송» · «내일 16:40» — 날 글자가 없으면 상차 날
     * 상차 약속 원문은 목록 낱말 · 띠 · 첫 정거장 글자를 « · »로 잇고, 하차 원문은 둘째 정거장 글자다. 띠가 없어도 목록 값을 지우지 않는다.
     */
    private fun withDetailPromises(order: SimplifiedOfficeOrder, parsed: PickerDetailFromImage): SimplifiedOfficeOrder {
        val now = java.time.LocalDateTime.now()
        val listWords = firstPickupStop(order)?.promiseText
        val stop = ReservationText.read(parsed.pickup.at, now)
        val list = ReservationText.read(listWords, now, sameDayAs = stop.day)
        val band = ReservationText.read(parsed.reservedLine, now, sameDayAs = list.day ?: stop.day)
        val pickup = Reservation(band.day ?: list.day ?: stop.day, band.at ?: stop.at ?: list.at)
        val dropoff = ReservationText.read(parsed.dropoff.at, now, sameDayAs = pickup.day)
        val pickupText = listOfNotNull(listWords, parsed.reservedLine, parsed.pickup.at).distinct().joinToString(" · ").ifEmpty { null }
        return withLastDropoff(withFirstPickup(order.withPromises(pickup to dropoff)) { it.copy(promiseText = pickupText) }) { it.copy(promiseText = parsed.dropoff.at) }
    }
}
