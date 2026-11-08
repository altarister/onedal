package com.onedal.app.plugins.kakaopicker

import com.onedal.app.core.Reservation
import com.onedal.app.models.SimplifiedOfficeOrder
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import com.onedal.app.models.CallStop
import com.onedal.app.core.firstPickupStop

/**
 * 📅 **픽커 예약 — 목록은 꼬리표의 «예약 …» 낱말, 상세는 사진의 띠 · 정거장 시각과 합친다** (실물 예약 콜 · 약속 정해진 것 7).
 * 목록 «예약 18:30»처럼 날 낱말 없이 시각만 있거나 «예약»만이면 오늘 — 사진에 날이 보이면 그 날.
 */
class PickerReservationTest {
    private val parser = KakaoPickerParser(null)

    @Test fun `목록 예약 내일은 내일 · 원문은 예약 낱말`() {
        val o = parser.parse(listOf("퀵", "반나절", "중형", "예약", "내일", "용산", "4.7km", "광주", "경안", "한남", "16,093"))
        assertEquals(1, firstPickupStop(o)?.requestedDay)
        assertEquals("예약 내일", firstPickupStop(o)?.promiseText)
    }

    @Test fun `예약 태그가 없으면 약속이 없다`() {
        val o = parser.parse(listOf("퀵", "소형", "강남", "6.8km", "광주", "송정", "역삼1", "19,404"))
        assertNull(firstPickupStop(o)?.promiseText)
        assertNull(firstPickupStop(o)?.requestedDay)
    }

    private fun stop(at: String?) = PickerStopFromImage("경기 광주시 경안동", "람미당", 4.7, at)
    private val card = SimplifiedOfficeOrder(
        id = "c",
        fare = 16093,
        timestamp = "t",
        pickupDetails = listOf(CallStop(listText = "광주 경안", promiseText = "예약", requestedDay = 0)),
        dropoffDetails = listOf(CallStop(listText = "용산 한남")),
)

    @Test fun `상세 사진 내일 14시가 목록 예약만을 이긴다 · 하차 내일 17시49분`() {
        val parsed = PickerDetailFromImage(stop("내일 14:00"), PickerStopFromImage("서울 용산구 한남동", "아라마크", 26.4, "내일 17:49"), "중형", true)
        val r = PickerDetailOcrParser().verify(parsed, card, null, emptyList(), "") as PickerDetailOcrParser.VerifyResult.Success
        assertEquals(Reservation(1, "14:00"), Reservation(firstPickupStop(r.order)?.requestedDay, firstPickupStop(r.order)?.requestedTime))
        assertEquals(Reservation(1, "17:49"), Reservation(com.onedal.app.core.lastDropoffStop(r.order)?.requestedDay, com.onedal.app.core.lastDropoffStop(r.order)?.requestedTime))
        assertEquals("예약 · 내일 14:00", firstPickupStop(r.order)?.promiseText)
        assertEquals("내일 17:49", com.onedal.app.core.lastDropoffStop(r.order)?.promiseText)
    }

    /** 🔴 목록 «예약»만 — 날이 안 보이면 오늘(날 0) · 상차 약속 원문은 «예약» 낱말 */
    @Test fun `목록 예약만이면 오늘 · 원문은 예약 낱말`() {
        val o = parser.parse(listOf("퀵", "예약", "강남", "6.8km", "광주", "송정", "역삼1", "19,404"))
        assertEquals(0, firstPickupStop(o)?.requestedDay)
        assertEquals("예약", firstPickupStop(o)?.promiseText)
        assertEquals(true, com.onedal.app.core.engine.ReservationGate.passes(o, "today"))
    }

    /** 🔴 목록 «예약 내일» + 상세 띠 없음 — 상세가 «예약 아님»으로 덮지 않는다 · 날은 목록 · 시각은 첫 정거장(약속 정해진 것 7) */
    @Test fun `목록 예약 내일에 띠 없는 상세는 내일 그 시각`() {
        val listCard = parser.parse(listOf("퀵", "예약", "내일", "강남", "6.8km", "광주", "송정", "역삼1", "19,404"))
        val parsed = PickerDetailFromImage(stop("15:00"), PickerStopFromImage("서울 강남구 역삼1동", null, 26.4, null), null, false)
        val r = PickerDetailOcrParser().verify(parsed, listCard, null, emptyList(), "") as PickerDetailOcrParser.VerifyResult.Success
        assertEquals(listOf(1, "15:00"), listOf(firstPickupStop(r.order)?.requestedDay, firstPickupStop(r.order)?.requestedTime))
    }

    /** 🔴 오늘 콜 «17:04까지 픽업» · «19:22까지 배송» — 상차 · 하차 정거장 시각(약속 정해진 것 3 · 8) */
    @Test fun `까지 픽업 까지 배송은 상차 하차 정거장 오늘 그 시각`() {
        val parsed = PickerDetailFromImage(stop("17:04까지"), PickerStopFromImage("서울 용산구 한남동", null, 26.4, "19:22까지"), null, false)
        val r = PickerDetailOcrParser().verify(parsed, card, null, emptyList(), "") as PickerDetailOcrParser.VerifyResult.Success
        assertEquals(listOf(0, "17:04"), listOf(firstPickupStop(r.order)?.requestedDay, firstPickupStop(r.order)?.requestedTime))
        assertEquals(listOf(0, "19:22"), listOf(com.onedal.app.core.lastDropoffStop(r.order)?.requestedDay, com.onedal.app.core.lastDropoffStop(r.order)?.requestedTime))
    }
}
