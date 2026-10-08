package com.onedal.app.core

import com.onedal.app.core.engine.SessionManager
import com.onedal.app.models.ScreenContext
import com.onedal.app.models.SimplifiedOfficeOrder
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * 👆 **목록에서 누를 콜을 엮는 차례 · 조건** — 조각(손 먼저 · 알람 미룸 · 심사 중)마다 검사는 있었지만, 엮는 줄에서 하나가 빠져도 아무 검사도 몰랐다.
 * 값만 넣고 «누르나 · 소리 내나 · 안 연 까닭»을 본다.
 */
class ListTapPickTest {

    private var evaluatingReads = 0
    private fun facts(
        tapsList: Boolean = true, openedByApp: Boolean = false, hasBest: Boolean = true, handBlocks: Boolean = false,
        hold: AlarmHold.Kind? = AlarmHold.Kind.FIRE, evaluating: Boolean = false,
    ) = ListTapPick.GateFacts(tapsList, openedByApp, hasBest, handBlocks, hold, { evaluatingReads++; evaluating })

    @Test fun `다 맑으면 누르러 간다`() {
        val g = ListTapPick.gate(facts())
        assertTrue(g.planTap); assertNull(g.openBlocked)
    }

    @Test fun `직접 모드(목록에서 안 누름)는 아무것도 안 한다`() {
        val g = ListTapPick.gate(facts(tapsList = false))
        assertFalse(g.planTap); assertFalse(g.handHeld); assertNull(g.openBlocked)
    }

    @Test fun `앱이 연 콜이 있으면 바쁨 — 안 누르고 소리도 없다`() {
        val g = ListTapPick.gate(facts(openedByApp = true, hold = null))
        assertEquals(OpenBlocked.BUSY, g.openBlocked); assertFalse(g.planTap)
    }

    @Test fun `손 먼저면 누르기를 미룬다`() {
        val g = ListTapPick.gate(facts(handBlocks = true))
        assertTrue(g.handHeld); assertFalse(g.planTap)
        assertEquals(OpenBlocked.HAND_FIRST, g.openBlocked)
    }

    @Test fun `알람 미룸이면 안 누르고 다시 보기를 건다 — 손 먼저가 있으면 까닭은 손 먼저`() {
        val held = ListTapPick.gate(facts(hold = AlarmHold.Kind.HOLD))
        assertTrue(held.heldRecheck); assertFalse(held.planTap)
        assertEquals(OpenBlocked.ALARM_HELD, held.openBlocked)
        assertEquals(OpenBlocked.HAND_FIRST, ListTapPick.gate(facts(hold = AlarmHold.Kind.HOLD, handBlocks = true)).openBlocked)
    }

    @Test fun `알람 미룸이 «없음»이면 이번 읽기는 안 누른다`() {
        val g = ListTapPick.gate(facts(hold = AlarmHold.Kind.NONE))
        assertFalse(g.planTap); assertFalse(g.heldRecheck)
    }

    @Test fun `서버가 앞 콜을 심사 중이면 안 누르고 소리도 없다`() {
        val g = ListTapPick.gate(facts(evaluating = true))
        assertTrue(g.evaluatingStop); assertFalse(g.planTap)
        assertEquals(OpenBlocked.EVALUATING, g.openBlocked)
    }

    @Test fun `심사 중은 누르러 갈 차례에 닿았을 때만 읽는다`() {
        evaluatingReads = 0
        ListTapPick.gate(facts(hold = AlarmHold.Kind.HOLD))
        ListTapPick.gate(facts(openedByApp = true, hold = null))
        assertEquals(0, evaluatingReads)
        ListTapPick.gate(facts())
        assertEquals(1, evaluatingReads)
    }

    @Test fun `통과 콜이 없으면 바쁨도 손 먼저도 아니다`() {
        val g = ListTapPick.gate(facts(hasBest = false, handBlocks = true, hold = AlarmHold.Kind.NONE))
        assertFalse(g.handHeld); assertNull(g.openBlocked)
        assertNull(ListTapPick.gate(facts(hasBest = false, openedByApp = true, hold = null)).openBlocked)
    }

    @Test fun `누를 자리를 못 정했으면 — 방금 스크롤이면 흐르는 목록 · 아니면 배차망 까닭 · 없으면 HELD`() {
        assertEquals(OpenBlocked.LIST_MOVING, ListTapPick.afterPlan(true, OpenBlocked.TAB_BAR))
        assertEquals(OpenBlocked.TAB_BAR, ListTapPick.afterPlan(false, OpenBlocked.TAB_BAR))
        assertEquals(OpenBlocked.HELD, ListTapPick.afterPlan(false, null))
    }

    private fun stop(
        onList: Boolean = true, busy: Boolean = false, handBlocks: Boolean = false, evaluating: Boolean = false,
        scanY: Int = 500, nowY: Int? = 500, scrolled: Boolean = false,
    ) = ListTapPick.recheckStop(onList, busy, handBlocks, "목록 스크롤", { evaluatingReads++; evaluating }, scanY, nowY, scrolled)

    @Test fun `넘김 뒤 다시 보기 — 다 맑으면 쏜다`() { assertNull(stop()) }

    @Test fun `넘김 뒤 다시 보기 — 까닭마다 키`() {
        assertEquals(OpenBlocked.TAP_RECHECK, stop(onList = false)?.second)
        assertEquals(OpenBlocked.BUSY, stop(busy = true)?.second)
        assertEquals(OpenBlocked.HAND_FIRST, stop(handBlocks = true)?.second)
        assertTrue(stop(handBlocks = true)!!.first.contains("목록 스크롤"))
        assertEquals(OpenBlocked.EVALUATING, stop(evaluating = true)?.second)
        assertEquals(OpenBlocked.TAP_RECHECK, stop(nowY = null)?.second)
        assertEquals(OpenBlocked.LIST_MOVING, stop(nowY = 900)?.second)
    }

    @Test fun `넘김 뒤 다시 보기 — 차례는 목록 아님이 먼저 · 심사 중은 앞이 맑을 때만 읽는다`() {
        assertEquals("목록이 아니다", stop(onList = false, busy = true, handBlocks = true, evaluating = true, nowY = null)?.first)
        assertEquals(OpenBlocked.BUSY, stop(busy = true, handBlocks = true)?.second)
        evaluatingReads = 0
        stop(busy = true, evaluating = true)
        assertEquals(0, evaluatingReads)
    }

    @Test fun `누르기 성공 뒤 기록 — 콜 기억 · 알람 경로 · 세션이 실제로 바뀐다`() {
        val memory = CallMemory(); val routes = AlarmedRoutes(); val session = SessionManager()
        val o = SimplifiedOfficeOrder(id = "o1", pickup = "경기 광주 초월읍", dropoff = "경기 이천 신둔면", fare = 50000, timestamp = "t", pickupDistance = 3.0)
        val hash = CallMemory.fingerprintOf(o)
        ListTapRecord.recordTapped(memory, routes, session, o, hash, willContract = true, nowMs = 1_000L, tapAtMs = 900L, foundAtMs = 800L,
            screen = ScreenContext.LIST, page = "목록")
        assertTrue(memory.alreadyEvaluated(hash))
        assertTrue(routes.opened(o))
        assertTrue(session.openedByApp); assertTrue(session.contractedByApp)
        assertEquals("o1", session.currentOrderId)
        assertEquals(o, session.lastDetailOrder); assertEquals(o, session.alarmTappedCard)
        assertEquals(900L, session.alarmTappedAtMs); assertEquals(800L, session.alarmFoundAtMs)
        assertEquals(ScreenContext.LIST, session.alarmTappedScreen); assertEquals("목록", session.alarmTappedPage)
        val s2 = SessionManager()
        ListTapRecord.recordTapped(CallMemory(), AlarmedRoutes(), s2, o, hash, willContract = false, nowMs = 1L, tapAtMs = 1L, foundAtMs = 1L,
            screen = ScreenContext.LIST, page = null)
        assertFalse("앱이 계약하지 않는 콜(알람 · 내일 콜)은 계약 칸이 꺼진다", s2.contractedByApp)
    }
}
