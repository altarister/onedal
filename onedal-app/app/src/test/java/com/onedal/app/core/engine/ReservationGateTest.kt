package com.onedal.app.core.engine

import com.onedal.app.models.FilterConfig
import com.onedal.app.models.FilterTally
import com.onedal.app.models.SimplifiedOfficeOrder
import com.onedal.app.plugins.insung.InsungParser
import com.onedal.app.plugins.kakaopicker.KakaoPickerParser
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * 📅 **예약 필터 — 목록은 확실한 내일만 막고, 날 모름은 상세까지 들여 채운 뒤에 막는다** (예약콜 1단계 · 기사님 «가»).
 * «내일 걸 오늘 잡는다면 사고다 — 확실하게 필터링할 수 있어야 한다» — 채운 뒤 필터가 마지막 문이다.
 */
class ReservationGateTest {

    private fun call(reserved: Boolean?, day: Int?) = SimplifiedOfficeOrder(
        id = "c", pickup = "광주 경안", dropoff = "용산 한남", fare = 20000, timestamp = "t",
        reserved = reserved, reservedDay = day, pickupDistance = 3.0)
    private val none = call(null, null)
    private val today = call(true, 0)
    private val tomorrow = call(true, 1)
    private val dayAfter = call(true, 2)
    private val unknown = call(true, null)

    @Test fun `값이 없으면 오늘 콜만 - 안전한 쪽`() {
        assertEquals("today", ReservationGate.modeOf(null))
        assertEquals("today", ReservationGate.modeOf(""))
        assertEquals("today", ReservationGate.modeOf("nonsense"))
        assertEquals("tomorrowToo", ReservationGate.modeOf("tomorrowToo"))
    }

    @Test fun `오늘 콜만 - 목록은 확실한 내일만 막고 날 모름은 상세로`() {
        assertTrue(ReservationGate.passesList(none, "today"))
        assertTrue(ReservationGate.passesList(today, "today"))
        assertTrue(ReservationGate.passesList(unknown, "today"))
        assertFalse(ReservationGate.passesList(tomorrow, "today"))
        assertFalse(ReservationGate.passesList(dayAfter, "today"))
    }

    @Test fun `오늘 콜만 - 채운 뒤에는 날 모름도 막는다`() {
        assertTrue(ReservationGate.passesAfterFill(none, "today"))
        assertTrue(ReservationGate.passesAfterFill(today, "today"))
        assertFalse(ReservationGate.passesAfterFill(unknown, "today"))
        assertFalse(ReservationGate.passesAfterFill(tomorrow, "today"))
    }

    @Test fun `내일 콜도 - 모레부터 막고 채운 뒤 날 모름은 막는다`() {
        assertTrue(ReservationGate.passesList(tomorrow, "tomorrowToo"))
        assertTrue(ReservationGate.passesList(unknown, "tomorrowToo"))
        assertFalse(ReservationGate.passesList(dayAfter, "tomorrowToo"))
        assertTrue(ReservationGate.passesAfterFill(tomorrow, "tomorrowToo"))
        assertTrue(ReservationGate.passesAfterFill(none, "tomorrowToo"))
        assertFalse(ReservationGate.passesAfterFill(unknown, "tomorrowToo"))
    }

    @Test fun `내일 콜만 - 오늘 콜과 보통 콜을 막는다`() {
        assertTrue(ReservationGate.passesList(tomorrow, "tomorrowOnly"))
        assertTrue(ReservationGate.passesList(unknown, "tomorrowOnly"))
        assertFalse(ReservationGate.passesList(none, "tomorrowOnly"))
        assertFalse(ReservationGate.passesList(today, "tomorrowOnly"))
        assertTrue(ReservationGate.passesAfterFill(tomorrow, "tomorrowOnly"))
        assertFalse(ReservationGate.passesAfterFill(unknown, "tomorrowOnly"))
    }

    @Test fun `오늘 콜인가 - 표시 없음이나 0일 때만`() {
        assertTrue(ReservationGate.isToday(none))
        assertTrue(ReservationGate.isToday(today))
        assertFalse(ReservationGate.isToday(unknown))
        assertFalse(ReservationGate.isToday(tomorrow))
    }

    @Test fun `인성 판정 - 내일 콜은 예약 축으로 떨어지고 성적표에 센다`() {
        val tally = FilterTally()
        val v = InsungParser.judge(tomorrow, FilterConfig(isActive = true), tally)
        assertFalse(v.passed)
        assertEquals("reservation", v.axis)
        assertEquals(1, tally.reservation)
    }

    @Test fun `픽커 판정 - 내일 콜은 reservation · 날 모름은 목록에서 통과`() {
        assertEquals("reservation", KakaoPickerParser.verdictAxisOf(tomorrow, 10000, 10.0))
        assertEquals(null, KakaoPickerParser.verdictAxisOf(unknown, 10000, 10.0))
    }

    /** 🌙 시각만 적힌 밤 콜은 오늘 콜이다 — «오늘 콜만»이어도 통과하고, 자동이면 확정한다 (날은 ReservationText 가 정한다) */
    @Test fun `오늘 콜만 - 시각만 적힌 밤 콜은 통과하고 자동 확정 대상이다`() {
        val night = java.time.LocalDateTime.of(2026, 10, 2, 23, 15)
        val r = com.onedal.app.core.ReservationText.read("00:08", night)
        val o = SimplifiedOfficeOrder(id = "n", pickup = "a", dropoff = "b", fare = 30000, timestamp = "t", reserved = r.marked, reservedDay = r.day)
        assertTrue(ReservationGate.passesList(o, ReservationGate.TODAY))
        assertTrue(ReservationGate.passesAfterFill(o, ReservationGate.TODAY))
        assertTrue(ReservationGate.isToday(o))
    }
}
