package com.onedal.app.plugins.kakaopicker

import com.onedal.app.core.Reservation
import com.onedal.app.models.SimplifiedOfficeOrder
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * 📅 **픽커 예약 — 목록은 태그 줄, 상세는 사진의 «내일 14:00 픽업예약»이 이긴다** (실물 09-30 08:04 예약 콜).
 * 목록 «예약 18:30»처럼 날 낱말 없이 시각만 있으면 오늘 · «예약»만이면 날 모름 — 사진이 가른다.
 */
class PickerReservationTest {
    private val parser = KakaoPickerParser(null)

    @Test fun `목록 예약 내일은 내일`() {
        val o = parser.parse(listOf("퀵", "반나절", "중형", "예약", "내일", "용산", "4.7km", "광주", "경안", "한남", "16,093"))
        assertEquals(true, o.reserved)
        assertEquals(1, o.reservedDay)
    }

    @Test fun `목록 예약만 있으면 날 모름`() {
        val o = parser.parse(listOf("퀵", "예약", "강남", "6.8km", "광주", "송정", "역삼1", "19,404"))
        assertEquals(true, o.reserved)
        assertNull(o.reservedDay)
    }

    @Test fun `예약 태그가 없으면 예약이 아니다`() {
        val o = parser.parse(listOf("퀵", "소형", "강남", "6.8km", "광주", "송정", "역삼1", "19,404"))
        assertEquals(false, o.reserved)
        assertNull(o.reservedDay)
    }

    private fun stop(at: String?) = PickerStopFromImage("경기 광주시 경안동", "람미당", 4.7, at)
    private val card = SimplifiedOfficeOrder(id = "c", pickup = "광주 경안", dropoff = "용산 한남", fare = 16093,
        timestamp = "t", reserved = true, reservedDay = null)

    @Test fun `상세 사진 내일 14시 픽업예약이 목록 값을 덮는다`() {
        val parsed = PickerDetailFromImage(stop("내일 14:00"), PickerStopFromImage("서울 용산구 한남동", "아라마크", 26.4, "내일 17:49"), "중형", true)
        val r = PickerDetailOcrParser().verify(parsed, card, null, emptyList(), "") as PickerDetailOcrParser.VerifyResult.Success
        assertEquals(Reservation(true, 1, "14:00"), Reservation(r.order.reserved == true, r.order.reservedDay, r.order.reservedAt))
    }

    @Test fun `상세 사진에 픽업예약이 없으면 예약이 아니다`() {
        val parsed = PickerDetailFromImage(stop("10:00까지"), PickerStopFromImage("서울 용산구 한남동", null, 26.4, "12:39까지"), null, false)
        val r = PickerDetailOcrParser().verify(parsed, card, null, emptyList(), "") as PickerDetailOcrParser.VerifyResult.Success
        assertEquals(false, r.order.reserved)
        assertNull(r.order.reservedDay)
    }
}
