package com.onedal.app.plugins.insung

import com.onedal.app.core.LocationTextAnalyzer
import com.onedal.app.core.Reservation
import com.onedal.app.models.LoadLine
import com.onedal.app.models.SimplifiedOfficeOrder
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDateTime

/**
 * 📅 **인성 정거장 약속은 제 칸의 약속 토막으로 읽는다** — 실물 목록 «@낼7시/초이동» · «@대곡동 → 낼8/중구봉래동».
 * 도착지 칸의 «낼8»은 하차 약속이다 — 상차 날로 읽으면 오늘 상차 콜이 «내일 콜»로 막힌다. 하차 날 글자가 없으면 상차 날이다.
 * 🔴 날 표시 없는 시각(«21시/»)은 이르든 늦든 오늘 — 실물 인성은 내일에 «낼»을 적는다(한 화면에 «낼7시/»와 «21시/»가 나란히).
 */
class InsungReservationTest {
    private val now = LocalDateTime.of(2026, 9, 30, 15, 0)

    private fun promiseOf(cell: String) = LocationTextAnalyzer.split(cell, InsungPages.badgeWords).promise

    @Test fun `출발지 칸 낼7시는 내일 07시`() {
        assertEquals(Reservation(1, "07:00"), InsungParser.promisesOf(promiseOf("@낼7시/초이동"), null, now).first)
    }

    @Test fun `도착지 칸의 낼8은 하차 약속 - 상차 날이 아니다`() {
        val (pickup, dropoff) = InsungParser.promisesOf(promiseOf("@대곡동"), promiseOf("낼8/중구봉래동"), now)
        assertEquals(Reservation.NONE, pickup)
        assertEquals(Reservation(1, "08:00"), dropoff)
    }

    @Test fun `날 없는 시각은 늦든 이르든 오늘`() {
        assertEquals(Reservation(0, "21:00"), InsungParser.promisesOf(promiseOf("@21시/천호동"), null, now).first)
        assertEquals(Reservation(0, "09:00"), InsungParser.promisesOf(promiseOf("@9시/천호동"), null, now).first)
    }

    /** 🔴 도착지 칸 앞 «14시전»이 상차 약속으로 새지 않는다 — 하차 정거장 약속 원문으로 */
    @Test fun `목록 줄 - 하차 약속은 하차 정거장에 · 상차 약속이 없으면 비운다`() {
        val cells = InsungParser.listCellsOf(listOf("2.6", "20.4", "@가산동", "14시전/인천송도동", "다", "34.6"), emptySet(), "다", "")
        assertEquals("@가산동", cells.pickup.listText)
        assertEquals(null, cells.pickup.promiseText)
        assertEquals("14시전/인천송도동", cells.dropoff.listText)
        assertEquals("14시전", cells.dropoff.promiseText)
        assertEquals(true, cells.fromOtherOffice)
        assertEquals(Reservation.NONE, InsungParser.promisesOf(cells.pickup.promiseText, cells.dropoff.promiseText, now).first)
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

    /** 📦 칸 앞 «폰)» 은 짐 줄 «품목» — 출발 · 도착 칸에 둘 다 붙어도 한 줄(견본 `LOAD_EXAMPLE_INSUNG`) · 짐 묶음 `load.lines` 로 간다 */
    @Test fun `목록 줄 - 폰) 은 짐 줄 품목 한 줄`() {
        val cells = InsungParser.listCellsOf(listOf("1.7", "2.1", "@폰)철산동", "폰)개봉동", "오", "8.4"), emptySet(), "오", "")
        assertEquals(listOf(LoadLine("goods", "폰)")), cells.loadLines)
        val order = SimplifiedOfficeOrder(id = "c", timestamp = "", loadLines = cells.loadLines)
        assertEquals(listOf(LoadLine("goods", "폰)")), order.load?.lines)
        // 보고에는 짐 묶음 칸으로만 — 따로 «loadLines» 칸이 가지 않는다
        com.google.gson.Gson().toJson(order).let { assertTrue(it, !it.contains("loadLines") && it.contains("\"lines\":[{\"kind\":\"goods\"")) }
    }

    private fun parsed(vararg texts: String) = InsungParser(android.content.ContextWrapper(null)).parse(texts.toList())

    /** 🔴 도착지 칸 «14시전»은 하차 정거장 날 · 시각 — 상차 칸은 비어 있다(날 글자가 없으면 상차와 같은 날 · 상차 약속이 없으면 오늘) */
    @Test fun `하차 약속 14시전은 하차 정거장 오늘 14시 · 상차는 빈 값`() {
        val o = parsed("2.6", "20.4", "@가산동", "14시전/인천송도동", "다", "34.6")
        assertEquals(listOf(null, null), listOf(com.onedal.app.core.firstPickupStop(o)?.requestedDay, com.onedal.app.core.firstPickupStop(o)?.requestedTime))
        assertEquals(listOf(0, "14:00"), listOf(com.onedal.app.core.lastDropoffStop(o)?.requestedDay, com.onedal.app.core.lastDropoffStop(o)?.requestedTime))
    }

    /** 🔴 «@낼11-12시 … 14시전/» — 하차 날 글자가 없으면 상차 날(1)을 따른다(약속 정해진 것 5) */
    @Test fun `낼11-12시 상차면 14시전 하차는 내일 14시`() {
        val o = parsed("2.6", "20.4", "@낼11-12시/가산동", "14시전/인천송도동", "다", "34.6")
        assertEquals(listOf(1, "12:00"), listOf(com.onedal.app.core.firstPickupStop(o)?.requestedDay, com.onedal.app.core.firstPickupStop(o)?.requestedTime))
        assertEquals(listOf(1, "14:00"), listOf(com.onedal.app.core.lastDropoffStop(o)?.requestedDay, com.onedal.app.core.lastDropoffStop(o)?.requestedTime))
    }
}
