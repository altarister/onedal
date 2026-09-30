package com.onedal.app.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * ⏳ **기다림 장부 — 거는 함수가 걸기와 적기를 한 번에, 끄기도 여기서만** (1f · 04 · ab «가» · 기사님 «물어보고 진행하자»).
 * 오늘 버그 셋은 모두 «누가 무엇을 걸어 뒀나 안 보임»에서 났다 — 1초 보고 스위치를 셋이 나눠 씀 · 5분 묵은 «앱이 연 콜» · 3초 값 빌려 씀.
 */
class WaitBookTest {
    private var now = 1_000L
    private val posted = mutableListOf<Pair<Runnable, Long>>()
    private val book = WaitBook(object : WaitBook.Poster {
        override fun post(r: Runnable, delayMs: Long) { posted.add(r to delayMs) }
        override fun remove(r: Runnable) { posted.removeAll { it.first === r } }
    }) { now }

    @Test fun `같은 이름을 다시 걸면 앞의 것은 안 돈다`() {
        var ran = 0
        book.schedule("상세 대기", WaitBook.SESSION, 30_000) { ran += 1 }
        book.schedule("상세 대기", WaitBook.SESSION, 10_000) { ran += 10 }
        assertEquals(1, posted.size)
        posted.single().first.run()
        assertEquals(10, ran)
        assertTrue("돈 것은 장부에서 빠진다", book.pending().isEmpty())
    }

    @Test fun `세션 몫만 거두고 목록·판결 몫은 남긴다`() {
        book.schedule("상세 대기", WaitBook.SESSION, 30_000) {}
        book.schedule("손 클릭 AUTO 1초 보고", WaitBook.SESSION, 10_000) {}
        book.schedule("손 멈춤", WaitBook.LIST, 3_050) {}
        book.schedule("판결 버튼", WaitBook.DECISION, 500) {}
        assertEquals(listOf("상세 대기", "손 클릭 AUTO 1초 보고"), book.cancelOwner(WaitBook.SESSION))
        assertEquals(listOf("손 멈춤", "판결 버튼"), book.pending().map { it.name })
        assertEquals(2, posted.size)
    }

    @Test fun `남은 ms`() {
        book.schedule("상세 대기", WaitBook.SESSION, 30_000) {}
        now += 5_000
        assertEquals(25_000L, book.pending().single().remainMs)
    }

    private val root = "src/main/java/com/onedal/app"
    private fun count(file: String) = Regex("""postDelayed\(|\.schedule\(\{""").findAll(File("$root/$file").readText()).count()

    @Test fun `기다림을 직접 거는 줄은 아직 안 옮긴 자리뿐`() {
        // 옮길 때마다 이 수가 준다 — 새 줄이 생기거나 옮긴 자리가 되살아나면 빨간불 (WaitBook.schedule 로 건다)
        val left = mapOf(
            "HijackService.kt" to 10,        // 창구(Poster) 1 · 시험 버튼 · 목록 요약 2 · 목록 감시 2 · 스크롤 · 내용 · 겹친 틀 뒤 · 미룬 알람
            "core/TelemetryManager.kt" to 2, "core/AutoTouchManager.kt" to 1, "core/engine/SafeCancelTimer.kt" to 1,
            "core/AlarmSignaler.kt" to 3, "core/ScreenReader.kt" to 1, "core/engine/PreConfirmSequence.kt" to 0,
        )
        left.forEach { (f, n) -> assertEquals(f, n, count(f)) }
    }

    @Test fun `판결 버튼은 판결 몫 · 세션이 끝나면 세션 몫을 거두고 손 클릭 AUTO 1초 보고를 끈다`() {
        val src = File("$root/HijackService.kt").readText()
        assertTrue("취소 누름을 잃지 않게 세션 몫에서 뺀다", src.contains("waitBook.schedule(\"판결 버튼\", com.onedal.app.core.WaitBook.DECISION, 500)"))
        val reset = src.substringAfter("override fun resetSessionState() {").substringBefore("\n    }")
        assertTrue(reset.contains("waitBook.cancelOwner(com.onedal.app.core.WaitBook.SESSION)"))
        assertTrue(reset.contains("setFastPoll(com.onedal.app.core.PollOwners.HAND_AUTO, false)"))
        assertFalse(File("$root/core/engine/PreConfirmSequence.kt").readText().contains("mainHandler.postDelayed"))
    }
}
