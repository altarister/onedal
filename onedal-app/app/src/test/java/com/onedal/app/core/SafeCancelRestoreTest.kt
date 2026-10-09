package com.onedal.app.core

import com.onedal.app.core.engine.SafeCancelTimer
import com.onedal.app.core.engine.SessionManager
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * 💾 **원달앱이 다시 떠도 안전취소를 다시 건다** (D1 ② · 기사님 «가») — 걸 때 «콜 번호 · 벽시계 마감»을 적고,
 *    다시 뜨면 남은 시간으로 되살린다. 결재로 끄면 지운다 · 서비스가 내려갈 때는 지우지 않는다.
 */
class SafeCancelRestoreTest {
    private class FakeStore : SafeCancelTimer.Store {
        var v: SafeCancelTimer.Armed? = null
        override fun put(armed: SafeCancelTimer.Armed) { v = armed }
        override fun get() = v
        override fun clear() { v = null }
    }
    private val posted = mutableListOf<Pair<Runnable, Long>>()
    private val book = WaitBook(object : WaitBook.Poster {
        override fun post(r: Runnable, delayMs: Long) { posted.add(r to delayMs) }
        override fun remove(r: Runnable) { posted.removeAll { it.first === r } }
    }) { 0L }
    private val store = FakeStore()
    private var wall = 1_000L
    private fun timer() = SafeCancelTimer(book, store, { wall }) { 0L }
    private fun contracted() = SessionManager().apply { contractedByApp = true; setOrderId("call-A") }

    @Test fun `🔴 걸고 내려갔다 다시 뜨면 남은 시간 뒤 운다`() {
        val first = timer()
        first.start(30_000, contracted()) { }
        first.pauseForShutdown()                       // 서비스 내려감 — 저장은 남는다
        posted.clear()
        wall += 10_000
        var fired = 0
        val back = timer().restore(SessionManager()) { fired++ }
        assertEquals("call-A" to 20_000L, back)
        assertEquals(20_000L, posted.single().second)
        posted.single().first.run()
        assertEquals(1, fired)
    }

    @Test fun `대조 — 결재로 끄면 지워져 다시 떠도 안 건다`() {
        val s = contracted()
        val first = timer()
        first.start(30_000, s) { }
        first.cancel(s)
        assertNull(timer().restore(SessionManager()) { })
    }

    @Test fun `마감이 지난 채 다시 뜨면 바로 시간 끝`() {
        timer().start(30_000, contracted()) { }
        posted.clear()
        wall += 60_000
        var fired = 0
        timer().restore(SessionManager()) { fired++ }
        assertEquals(0L, posted.single().second)
        posted.single().first.run()
        assertEquals(1, fired)
    }
}
