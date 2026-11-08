package com.onedal.app.plugins.insung

import com.onedal.app.core.LocationTextAnalyzer
import com.onedal.app.core.Reservation
import org.junit.Assert.assertEquals
import org.junit.Test
import java.time.LocalDateTime

/**
 * 📅 **인성 예약은 출발지 칸의 약속 토막으로만 읽는다** — 실물 목록 «@낼7시/초이동» · «@대곡동 → 낼8/중구봉래동».
 * 도착지 칸의 «낼8»은 도착 약속이다 — 상차 날로 읽으면 오늘 상차 콜이 «내일 콜»로 막힌다. 하차 약속 토막은 하차 정거장에 남는다.
 * 🔴 날 표시 없는 시각(«21시/»)은 이르든 늦든 오늘 — 실물 인성은 내일에 «낼»을 적는다(한 화면에 «낼7시/»와 «21시/»가 나란히).
 */
class InsungReservationTest {
    private val now = LocalDateTime.of(2026, 9, 30, 15, 0)

    private fun promiseOf(cell: String) = LocationTextAnalyzer.split(cell, InsungPages.badgeWords).promise

    @Test fun `출발지 칸 낼7시는 내일 07시`() {
        assertEquals(Reservation(true, 1, "07:00"), InsungParser.reservationOf(promiseOf("@낼7시/초이동"), now))
    }

    @Test fun `도착지 칸의 낼8은 상차 날이 아니다`() {
        assertEquals(Reservation.NONE, InsungParser.reservationOf(promiseOf("@대곡동"), now))
    }

    @Test fun `날 없는 시각은 늦든 이르든 오늘`() {
        assertEquals(Reservation(true, 0, "21:00"), InsungParser.reservationOf(promiseOf("@21시/천호동"), now))
        assertEquals(Reservation(true, 0, "09:00"), InsungParser.reservationOf(promiseOf("@9시/천호동"), now))
    }

    /** 🔴 도착지 칸 앞 «14시전»이 상차 약속으로 새지 않는다 — 하차 정거장 약속 원문으로 */
    @Test fun `목록 줄 - 하차 약속은 하차 정거장에 · 상차 약속이 없으면 비운다`() {
        val cells = InsungParser.listCellsOf(listOf("2.6", "20.4", "@가산동", "14시전/인천송도동", "다", "34.6"), emptySet(), "다", "")
        assertEquals("@가산동", cells.pickup.listText)
        assertEquals(null, cells.pickup.promiseText)
        assertEquals("14시전/인천송도동", cells.dropoff.listText)
        assertEquals("14시전", cells.dropoff.promiseText)
        assertEquals(true, cells.fromOtherOffice)
        assertEquals(Reservation.NONE, InsungParser.reservationOf(cells.pickup.promiseText, now))
    }

    /** 시뮬레이터 인성 목록 — «@» 는 노드 따로 · «급송»은 조건 토막(화면 기록) · 지역 칸 글자는 칸 원문 */
    @Test fun `목록 줄 - 따로 온 «@» 는 공유콜 · 급송은 조건 토막`() {
        val shared = InsungParser.listCellsOf(listOf("1.2", "8.0", "@", "오전1시41/곤지암읍", "초월읍", "다", "40.0"), emptySet(), "다", "")
        assertEquals(true, shared.fromOtherOffice)
        assertEquals("오전1시41", shared.pickup.promiseText)
        assertEquals("곤지암읍", shared.pickup.region)
        val express = InsungParser.listCellsOf(listOf("1.2", "8.0", "급송/초월읍", "곤지암읍", "다", "40.0"), emptySet(), "다", "")
        assertEquals(false, express.fromOtherOffice)
        assertEquals(null, express.pickup.promiseText)
        assertEquals(listOf("급송"), express.conditions)
    }
}
