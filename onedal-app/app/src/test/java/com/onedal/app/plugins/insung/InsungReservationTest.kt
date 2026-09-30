package com.onedal.app.plugins.insung

import com.onedal.app.core.LocationTextAnalyzer
import com.onedal.app.core.Reservation
import org.junit.Assert.assertEquals
import org.junit.Test
import java.time.LocalDateTime

/**
 * 📅 **인성 예약은 출발지 칸 앞글자로만 읽는다** — 실물 목록 «@낼7시/초이동» · «@대곡동 → 낼8/중구봉래동».
 * 도착지 칸의 «낼8»은 도착 약속이다 — 상차 날로 읽으면 오늘 상차 콜이 «내일 콜»로 막힌다.
 * 🔴 날 없는 늦은 시각(«21시/»)은 오늘 — 실물 인성은 내일에 «낼»을 적는다(한 화면에 «낼7시/»와 «21시/»가 나란히).
 */
class InsungReservationTest {
    private val now = LocalDateTime.of(2026, 9, 30, 15, 0)

    @Test fun `출발지 칸 낼7시는 내일 07시`() {
        val pickup = LocationTextAnalyzer.analyze("@낼7시/초이동")
        assertEquals(Reservation(true, 1, "07:00"), InsungParser.reservationOf(pickup, now))
    }

    @Test fun `도착지 칸의 낼8은 상차 날이 아니다`() {
        val pickup = LocationTextAnalyzer.analyze("@대곡동")
        assertEquals(Reservation.NONE, InsungParser.reservationOf(pickup, now))
    }

    @Test fun `날 없는 늦은 시각은 오늘`() {
        val pickup = LocationTextAnalyzer.analyze("@21시/천호동")
        assertEquals(Reservation(true, 0, "21:00"), InsungParser.reservationOf(pickup, now))
    }
}
