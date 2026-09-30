package com.onedal.app.core

import org.junit.Assert.assertEquals
import org.junit.Test
import java.time.LocalDateTime

/**
 * 📅 **예약이 언제인가 — 상차 쪽 글자 하나로 읽는다** (예약콜 1단계 · 세 배차망 공통 한 벌).
 * 정답지는 실물 화면 글자다 — 인성 목록 «낼7시/»·«21시/»·«10일/», 픽커 «예약 내일»·«예약 18:30»·«예약 9/30(수)»·«예약»만,
 * 화물24시 «당상»·«당일오후1시상». 날은 달력 기준(폰 날짜)이다.
 */
class ReservationTextTest {

    private val morning = LocalDateTime.of(2026, 9, 30, 12, 27)
    private fun read(t: String?, now: LocalDateTime = morning, bareLaterIsToday: Boolean = false) =
        ReservationText.read(t, now, bareLaterIsToday)

    @Test fun `글자가 없으면 예약이 아니다`() {
        assertEquals(Reservation.NONE, read(null))
        assertEquals(Reservation.NONE, read(""))
        assertEquals(Reservation.NONE, read("급송"))
        assertEquals(Reservation.NONE, read("@"))
    }

    @Test fun `인성 낼 - 내일 그 시각`() {
        assertEquals(Reservation(true, 1, "07:00"), read("@낼7시"))
        assertEquals(Reservation(true, 1, "06:30"), read("@낼6시30"))
        assertEquals(Reservation(true, 1, "08:00"), read("낼08시"))
        assertEquals(Reservation(true, 1, "08:00"), read("낼8"))
        assertEquals(Reservation(true, 1, "06:00"), read("@낼6시("))
        assertEquals(Reservation(true, 1, "09:30"), read("낼9시반"))
    }

    @Test fun `시각만 - 지금보다 이르면 내일`() {
        assertEquals(Reservation(true, 1, "08:00"), read("8시"))
        assertEquals(Reservation(true, 1, "08:30"), read("예약 08:30"))
    }

    @Test fun `시각만 - 지금보다 늦으면 인성은 오늘 · 그 밖은 날 모름`() {
        assertEquals(Reservation(true, 0, "21:00"), read("@21시", bareLaterIsToday = true))
        assertEquals(Reservation(true, 0, "19:30"), read("@오후7시30", bareLaterIsToday = true))
        assertEquals(Reservation(true, null, "18:30"), read("예약 18:30"))
        assertEquals(Reservation(true, 1, "18:30"), read("예약 18:30", now = LocalDateTime.of(2026, 9, 30, 19, 0)))
    }

    @Test fun `오전 오후 저녁 낮`() {
        assertEquals(Reservation(true, 0, "19:00"), read("저녁7시", bareLaterIsToday = true))
        assertEquals(Reservation(true, 0, "12:00"), read("낮12시", now = LocalDateTime.of(2026, 9, 30, 10, 0), bareLaterIsToday = true))
        assertEquals(Reservation(true, 1, "10:00"), read("오전10시"))
    }

    @Test fun `N일 - 이 달 그날 · 지났으면 다음 달`() {
        assertEquals(Reservation(true, 10, null), read("10일", now = LocalDateTime.of(2026, 9, 30, 9, 0)))
        assertEquals(Reservation(true, 0, "09:00"), read("30일)09시"))
        assertEquals(Reservation(true, 1, null), read("1일", now = LocalDateTime.of(2026, 12, 31, 9, 0)))
    }

    @Test fun `월 일 요일 배지 - 해 넘김`() {
        assertEquals(Reservation(true, 0, null), read("예약 9/30(수)"))
        assertEquals(Reservation(true, 1, null), read("예약 10/1(목)"))
        assertEquals(Reservation(true, 1, null), read("예약 1/1(금)", now = LocalDateTime.of(2026, 12, 31, 9, 0)))
    }

    @Test fun `픽커 - 예약 내일 · 예약만`() {
        assertEquals(Reservation(true, 1, null), read("퀵 반나절 예약 내일"))
        assertEquals(Reservation(true, 1, "14:00"), read("예약 내일 14:00"))
        assertEquals(Reservation(true, 0, "15:00"), read("예약 오늘 15:00"))
        assertEquals(Reservation(true, null, null), read("퀵 예약"))
    }

    @Test fun `픽커 오늘 콜의 마감 시각은 예약이 아니다`() {
        assertEquals(Reservation.NONE, read("10:00까지"))
    }

    @Test fun `화물24시 - 당상 내상 · 당일 상차 글`() {
        assertEquals(Reservation(true, 0, null), read("당상"))
        assertEquals(Reservation(true, 1, null), read("내상"))
        assertEquals(Reservation(true, 0, "13:00"), read("예약 당일오후1시상"))
        assertEquals(Reservation(true, 2, null), read("모레"))
    }

    @Test fun `보낼 같은 말 속의 낼은 날 낱말이 아니다`() {
        assertEquals(Reservation.NONE, read("보낼것"))
    }
}
