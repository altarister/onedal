package com.onedal.app.core

import com.onedal.app.core.engine.SafeCancelTimer
import com.onedal.app.core.engine.SessionManager
import com.onedal.app.plugins.hwamul24.Hwamul24Keywords
import com.onedal.app.plugins.insung.InsungKeywords
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * 🛡️ **집행 순서 — 타이머를 끈 뒤에도 «그 배차망으로 돌아감»이 남는다** (38 F36 · 24 리뷰).
 * 집행은 타이머를 끄며 시작하는데, 끄면 지킨 배차망이 지워진다. 떠 둔 계약을 받아 할 일을 고르므로
 * 인성 자동 계약 → 픽커 화면 → 시간 끝이면 «돌아감»이어야 한다(지운 값을 읽으면 «못 누름»).
 * 못 잡는 것: HijackService 가 begin 을 부르고 그 값을 넘기는 배선 · 실제로 앞으로 불러오기 — 폰 day1 S16.
 */
class DecisionRunTest {
    private val book = WaitBook(object : WaitBook.Poster {
        override fun post(r: Runnable, delayMs: Long) {}
        override fun remove(r: Runnable) {}
    }) { 0L }
    private fun armed(): Pair<SafeCancelTimer, SessionManager> {
        val t = SafeCancelTimer(book, null, { 0L }) { 0L }
        val s = SessionManager().apply { contractedByApp = true; setOrderId("call-A") }
        t.start(30_000, s, network = "insung", pkg = TargetApp.SIMULATOR_PACKAGE) { }
        return t to s
    }

    @Test fun `🔴 인성 계약 · 픽커 화면 · 시간 끝 — 타이머를 끈 뒤에도 할 일은 돌아감`() {
        val (timer, s) = armed()
        val target = DecisionRun.begin(timer, "call-A", s)
        assertNull("타이머는 꺼졌다", timer.armedOrderId)
        assertEquals(DecisionRun.Target("call-A", "insung", TargetApp.SIMULATOR_PACKAGE), target)
        val word = DecisionWord.of(DecisionPlan.PRESS_CANCEL, InsungKeywords.INSUNG)
        assertEquals(DecisionRun.Step.RETURN, DecisionRun.next(target, TargetApp.KAKAOPICKER, word, "CANCEL", 0))
        assertEquals(DecisionRun.Step.PRESS, DecisionRun.next(target, TargetApp.INSUNG, word, "CANCEL", 600))
        assertEquals(DecisionRun.Step.NOT_PRESSED, DecisionRun.next(target, TargetApp.KAKAOPICKER, word, "CANCEL", 5_000))
    }

    @Test fun `단추 없는 배차망 — KEEP 은 누를 것 없음 · CANCEL 은 못 누름 · 지키지 않는 결재는 지금 화면에서`() {
        val t = DecisionRun.Target("call-B", TargetApp.HWAMUL24, null)
        assertEquals(DecisionRun.Step.NOTHING_TO_PRESS, DecisionRun.next(t, TargetApp.HWAMUL24, DecisionWord.of(DecisionPlan.PRESS_CLOSE, Hwamul24Keywords.TWENTYFOUR), "KEEP", 0))
        assertEquals(DecisionRun.Step.NOT_PRESSED, DecisionRun.next(t, TargetApp.HWAMUL24, DecisionWord.of(DecisionPlan.PRESS_CANCEL, Hwamul24Keywords.TWENTYFOUR), "CANCEL", 0))
        assertEquals(DecisionRun.Step.PRESS, DecisionRun.next(null, TargetApp.KAKAOPICKER, "취소", "CANCEL", 0))
    }

    @Test fun `🔴 결재 집행이 끝날 때까지 바쁨 — 타이머가 꺼져도 결재 버튼 기다림이 살아 있으면`() {
        assertTrue(DecisionRun.busy(null, listOf(DecisionRun.BUTTON_WAIT)))
        assertTrue(DecisionRun.busy("call-A", emptyList()))
        assertFalse(DecisionRun.busy(null, listOf("목록 요약")))
    }

    @Test fun `다른 콜의 결재는 지킨 계약이 아니다`() {
        val (timer, _) = armed()
        assertNull(DecisionRun.peek(timer, "call-Z"))
        assertNull(DecisionRun.peek(timer, null))
    }
}
