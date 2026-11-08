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
import com.onedal.app.models.CallStop

/**
 * 📅 **예약 필터 — 첫 상차 날만 본다** (예약콜 1단계 · 기사님 «가» · 약속 정해진 것 6).
 * «내일 걸 오늘 잡는다면 사고다 — 확실하게 필터링할 수 있어야 한다» — 목록과 채운 뒤(확정 앞 마지막 문)가 같은 규칙이다.
 * «예약»만 보이고 날이 없는 콜은 정거장 약속 읽기가 날 0 을 적어 오늘 콜로 통과한다.
 */
class ReservationGateTest {

    private fun call(promise: String?, day: Int?) = SimplifiedOfficeOrder(
        id = "c",
        fare = 20000,
        timestamp = "t",
        pickupDetails = listOf(CallStop(listText = "광주 경안", promiseText = promise, requestedDay = day, distanceKm = 3.0)),
        dropoffDetails = listOf(CallStop(listText = "용산 한남")),
)
    private val none = call(null, null)
    private val today = call("예약 10:00", 0)
    private val tomorrow = call("예약 내일", 1)
    private val dayAfter = call("모레", 2)
    private val reservedOnly = call("예약", 0)

    @Test fun `값이 없으면 오늘 콜만 - 안전한 쪽`() {
        assertEquals("today", ReservationGate.modeOf(null))
        assertEquals("today", ReservationGate.modeOf(""))
        assertEquals("today", ReservationGate.modeOf("nonsense"))
        assertEquals("tomorrowToo", ReservationGate.modeOf("tomorrowToo"))
    }

    @Test fun `오늘 콜만 - 약속 없음 · 날 0 은 통과 · 내일 이후는 막는다`() {
        assertTrue(ReservationGate.passes(none, "today"))
        assertTrue(ReservationGate.passes(today, "today"))
        assertTrue(ReservationGate.passes(reservedOnly, "today"))
        assertFalse(ReservationGate.passes(tomorrow, "today"))
        assertFalse(ReservationGate.passes(dayAfter, "today"))
    }

    @Test fun `내일 콜도 - 모레부터 막는다`() {
        assertTrue(ReservationGate.passes(tomorrow, "tomorrowToo"))
        assertTrue(ReservationGate.passes(none, "tomorrowToo"))
        assertTrue(ReservationGate.passes(reservedOnly, "tomorrowToo"))
        assertFalse(ReservationGate.passes(dayAfter, "tomorrowToo"))
    }

    @Test fun `내일 콜만 - 오늘 콜과 보통 콜을 막는다`() {
        assertTrue(ReservationGate.passes(tomorrow, "tomorrowOnly"))
        assertFalse(ReservationGate.passes(none, "tomorrowOnly"))
        assertFalse(ReservationGate.passes(today, "tomorrowOnly"))
        assertFalse(ReservationGate.passes(reservedOnly, "tomorrowOnly"))
    }

    @Test fun `오늘 콜인가 - 약속 없음이나 날 0 일 때만`() {
        assertTrue(ReservationGate.isToday(none))
        assertTrue(ReservationGate.isToday(today))
        assertTrue(ReservationGate.isToday(reservedOnly))
        assertFalse(ReservationGate.isToday(tomorrow))
    }

    /** 📅 로그 낱말 — 첫 상차 날 + 예약 콜이면 « 예약콜»(원달앱 `isReservedCall`) · 픽커 채점기가 읽는다 */
    @Test fun `로그 낱말 - 날과 예약 콜`() {
        assertEquals("없음", ReservationGate.wordOf(none))
        assertEquals("오늘 예약콜", ReservationGate.wordOf(reservedOnly))
        assertEquals("내일 예약콜", ReservationGate.wordOf(tomorrow))
        assertEquals("2일 뒤 예약콜", ReservationGate.wordOf(dayAfter))
        assertEquals("오늘", ReservationGate.wordOf(call("당상", 0)))
        assertEquals("오늘", ReservationGate.wordOf(call("17:04까지 픽업", 0)))
    }

    @Test fun `인성 판정 - 내일 콜은 예약 축으로 떨어지고 성적표에 센다`() {
        val tally = FilterTally()
        val v = InsungParser.judge(tomorrow, FilterConfig(isActive = true), tally)
        assertFalse(v.passed)
        assertEquals("reservation", v.axis)
        assertEquals(1, tally.reservation)
    }

    @Test fun `픽커 판정 - 내일 콜은 reservation · 예약만은 통과`() {
        assertEquals("reservation", KakaoPickerParser.verdictAxisOf(tomorrow, 10000, 10.0))
        assertEquals(null, KakaoPickerParser.verdictAxisOf(reservedOnly, 10000, 10.0))
    }

    /** 🌙 시각만 적힌 밤 콜은 오늘 콜이다 — «오늘 콜만»이어도 통과하고, 자동이면 확정한다 (날은 ReservationText 가 정한다) */
    @Test fun `오늘 콜만 - 시각만 적힌 밤 콜은 통과하고 자동 확정 대상이다`() {
        val night = java.time.LocalDateTime.of(2026, 10, 2, 23, 15)
        val r = com.onedal.app.core.ReservationText.read("00:08", night)
        val o = SimplifiedOfficeOrder(id = "n", fare = 30000, timestamp = "t", pickupDetails = listOf(CallStop(listText = "a", requestedDay = r.day)), dropoffDetails = listOf(CallStop(listText = "b")))
        assertTrue(ReservationGate.passes(o, ReservationGate.TODAY))
        assertTrue(ReservationGate.isToday(o))
    }
}
