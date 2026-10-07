package com.onedal.app.core

import com.onedal.app.core.engine.SafeCancelTimer
import com.onedal.app.core.engine.SessionManager
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * 🧪 **원달앱 운행 규칙을 동작으로 문다**.
 * 규칙마다 «일어나면 안 되는 경우»와 «일어나야 하는 경우(대조)»를 함께 둔다.
 * 못 잡는 것: 접근성 노드 · 블루투스 GATT · 화면 스레드 위의 실제 배선(함수를 부르는 자리는 BleFramesTest · ModeTablePairTest 의 글자 검사가 본다).
 */
class CoreRulesBehaviorTest {

    // ─── R18 체험은 수락 · 확정 · 닫기를 누르지 않는다(둘째 겹) ───
    @Test fun `🔴 체험이면 수락 · 확정 · 닫기 버튼을 막는다`() {
        for (t in listOf("수락하기", "배차 확정", "닫기")) assertTrue(t, ModeActs.blocksTap("SIMULATION", t))
    }
    @Test fun `대조 — 체험이어도 다른 버튼은 누른다 · 자동 · 알람은 막지 않는다`() {
        assertFalse(ModeActs.blocksTap("SIMULATION", "목록"))
        assertFalse(ModeActs.blocksTap("SIMULATION", "닫기 버튼 옆"))
        assertFalse(ModeActs.blocksTap("AUTO", "배차 확정"))
        assertFalse(ModeActs.blocksTap("ALARM", "수락하기"))
        assertFalse(ModeActs.blocksTap(null, "확정"))
    }

    // ─── R19 증명된 관제앱의 쓰기만 받는다 ───
    @Test fun `🔴 증명 전이거나 지금 관제앱이 아닌 기기의 쓰기는 버린다`() {
        assertFalse(BleFrames.acceptsWrite(proven = false, fromCentral = false))
        assertFalse(BleFrames.acceptsWrite(proven = false, fromCentral = true))
        assertFalse(BleFrames.acceptsWrite(proven = true, fromCentral = false))
    }
    @Test fun `대조 — 증명된 지금 관제앱의 쓰기는 받는다`() {
        assertTrue(BleFrames.acceptsWrite(proven = true, fromCentral = true))
    }

    // ─── R20 같은 결재가 다시 오면 실행하지 않는다 ───
    @Test fun `🔴 이미 실행한 콜의 결재가 다시 오면 다시 실행하지 않는다 — 지금 열린 콜이어도`() {
        assertEquals(DecisionStep.REPLAY, DecisionReplay.stepOf("o1", lastExecuted = "o1", currentOrderId = "o1"))
    }
    @Test fun `🔴 지금 열린 콜이 아니면 버린다`() {
        assertEquals(DecisionStep.GHOST, DecisionReplay.stepOf("o-old", lastExecuted = null, currentOrderId = "o2"))
    }
    @Test fun `대조 — 지금 콜의 처음 결재는 실행한다`() {
        assertEquals(DecisionStep.EXECUTE, DecisionReplay.stepOf("o2", lastExecuted = "o1", currentOrderId = "o2"))
    }

    // ─── R21 · R24 안전취소 타이머 — 시간 끝에 스스로 취소 · KEEP 받으면 꺼짐 · 콜 거두기에 안 지워짐 ───
    private var now = 1_000L
    private val posted = mutableListOf<Pair<Runnable, Long>>()
    private val book = WaitBook(object : WaitBook.Poster {
        override fun post(r: Runnable, delayMs: Long) { posted.add(r to delayMs) }
        override fun remove(r: Runnable) { posted.removeAll { it.first === r } }
    }) { now }
    private val timer = SafeCancelTimer(book) { now }
    private fun contracted() = SessionManager().apply { contractedByApp = true }

    @Test fun `🔴 R21 결재가 안 오면 시간 끝에 스스로 취소한다 — 서버 없이도`() {
        var fired = 0
        timer.start(30_000, contracted()) { fired++ }
        assertEquals(30_000L, posted.single().second)
        posted.single().first.run()
        assertEquals(1, fired)
    }
    @Test fun `🔴 R24 끄면(cancel) 시간이 끝나도 취소하지 않는다`() {
        var fired = 0
        val s = contracted()
        timer.start(30_000, s) { fired++ }
        timer.cancel(s)                       // KEEP 결재 → executeDecisionImmediately → cancelSafeCancelTimer 가 부르는 자리 — 그 배선은 이 검사 밖(P1)
        assertTrue("장부에서 빠진다", posted.isEmpty())
        assertFalse(s.isWaitingForDecision)
        assertNull(timer.remainSec)
        assertEquals(0, fired)
    }
    @Test fun `🔴 콜 한 건을 거둬도(세션 몫) 안전취소는 남는다 — 판결 몫`() {
        var fired = 0
        timer.start(30_000, contracted()) { fired++ }
        book.cancelOwner(WaitBook.SESSION)
        assertEquals(1, posted.size)
        posted.single().first.run()
        assertEquals(1, fired)
    }
    @Test fun `대조 — 원달앱이 계약하지 않은 콜에는 걸지 않는다`() {
        timer.start(30_000, SessionManager()) { }
        assertTrue(posted.isEmpty())
    }
    @Test fun `남은 초는 넣은 시계로 센다`() {
        timer.start(30_000, contracted()) { }
        assertEquals(30, timer.remainSec)
        now += 10_500
        assertEquals(20, timer.remainSec)
    }
}
