package com.onedal.app.core

import com.onedal.app.core.engine.SafeCancelTimer
import com.onedal.app.core.engine.SessionManager
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * 🔒 **목록으로 돌아와도 안전취소를 지킨다** (D1 ① · 기사님 «가») — 타이머가 제 콜 번호를 쥐고, 세션이 비어도(목록 복귀) 시간 끝에 운다.
 *    그 뒤 온 결재도 그 번호로 알아본다(`DecisionReplay`). 시간 끝에 취소 버튼을 못 찾으면 «안 눌렀음»(`CancelReport`).
 */
class SafeCancelArmedTest {
    private val posted = mutableListOf<Pair<Runnable, Long>>()
    private val book = WaitBook(object : WaitBook.Poster {
        override fun post(r: Runnable, delayMs: Long) { posted.add(r to delayMs) }
        override fun remove(r: Runnable) { posted.removeAll { it.first === r } }
    }) { 0L }
    private val timer = SafeCancelTimer(book) { 0L }
    private fun contracted(id: String) = SessionManager().apply { contractedByApp = true; setOrderId(id) }

    @Test fun `🔴 걸고 세션을 비워도 타이머는 제 콜 번호를 쥐고 시간 끝에 운다`() {
        var fired = 0
        val s = contracted("call-A")
        timer.start(30_000, s) { fired++ }
        s.reset()                                   // 세션만 비움 — 타이머를 끄는 것은 cancel 뿐(목록 복귀는 resetSessionState 가 cancel 을 부른다)
        assertEquals("call-A", timer.armedOrderId)
        posted.single().first.run()
        assertEquals(1, fired)
    }

    @Test fun `대조 — 결재로 끄면(cancel) 번호도 놓고 안 운다`() {
        var fired = 0
        val s = contracted("call-B")
        timer.start(30_000, s) { fired++ }
        timer.cancel(s)
        assertNull(timer.armedOrderId)
        assertEquals(0, fired)
    }

    @Test fun `세션 번호가 비어도 타이머가 지키는 콜의 결재는 집행 · 다른 콜은 버린다`() {
        assertEquals(DecisionStep.EXECUTE, DecisionReplay.stepOf("call-A", null, "", armedOrderId = "call-A"))
        assertEquals(DecisionStep.GHOST, DecisionReplay.stepOf("call-X", null, "", armedOrderId = "call-A"))
        assertEquals(DecisionStep.GHOST, DecisionReplay.stepOf("call-A", null, "", armedOrderId = null))   // 지키는 콜이 없으면 지금처럼
    }
}
