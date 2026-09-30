package com.onedal.app.plugins.kakaopicker

import com.onedal.app.core.OcrLine
import com.onedal.app.core.Reservation
import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * 📅 **예약 날은 «픽업예약» 띠 줄이 먼저** — 실물 09-30 14:21:40 (ok_1790745697317 · «오늘 17:00 픽업예약» · 픽업 줄 «17:00까지 픽업»).
 * 픽업 줄 시각만 보면 «…까지»(마감 꼴)라 날이 없어 «날 모름»으로 오늘 콜을 막았다.
 */
class PickerReservedBandTest {
    private fun detail(band: String, pickupAt: String) = PickerScreenOcr.parseDetail(listOf(
        OcrLine(20, "퀵 승용차 예약"), OcrLine(60, band),
        OcrLine(120, "경기 성남시 분당구 이매2동"), OcrLine(120, "픽업 15.7km"), OcrLine(150, pickupAt),
        OcrLine(200, "서울 강남구 논현2동"), OcrLine(200, "배송 14.0km"), OcrLine(230, "18:54까지 배송"),
    ))!!

    @Test fun `띠 줄 오늘 17시 - 픽업 줄이 까지 꼴이어도 오늘`() {
        val d = detail("오늘 17:00 픽업예약", "17:00까지 픽업")
        val card = com.onedal.app.models.SimplifiedOfficeOrder(id = "c", pickup = "분당 이매2", dropoff = "강남 논현2", fare = 15246, timestamp = "t")
        val r = PickerDetailOcrParser().verify(d, card, null, emptyList(), "") as PickerDetailOcrParser.VerifyResult.Success
        assertEquals(Reservation(true, 0, "17:00"), Reservation(r.order.reserved == true, r.order.reservedDay, r.order.reservedAt))
    }

    @Test fun `띠 줄 내일 14시`() {
        val d = detail("내일 14:00 픽업예약", "내일 14:00")
        val card = com.onedal.app.models.SimplifiedOfficeOrder(id = "c", pickup = "분당 이매2", dropoff = "강남 논현2", fare = 15246, timestamp = "t")
        val r = PickerDetailOcrParser().verify(d, card, null, emptyList(), "") as PickerDetailOcrParser.VerifyResult.Success
        assertEquals(1, r.order.reservedDay)
    }
}
