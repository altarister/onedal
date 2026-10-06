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
        book.schedule("결재 버튼", WaitBook.DECISION, 500) {}
        assertEquals(listOf("상세 대기", "손 클릭 AUTO 1초 보고"), book.cancelOwner(WaitBook.SESSION))
        assertEquals(listOf("손 멈춤", "결재 버튼"), book.pending().map { it.name })
        assertEquals(2, posted.size)
    }

    @Test fun `남은 ms`() {
        book.schedule("상세 대기", WaitBook.SESSION, 30_000) {}
        now += 5_000
        assertEquals(25_000L, book.pending().single().remainMs)
    }

    private val root = "src/main/java/com/onedal/app"
    private fun count(file: String) = Regex("""postDelayed\(|\.schedule\(\{""").findAll(File("$root/$file").readText()).count()

    @Test fun `기다림을 직접 거는 줄은 장부 창구와 사진 스레드 둘뿐`() {
        // 🔴 0 이 아닌 까닭 — HijackService 1 은 장부 자신의 창구(Poster) · ScreenReader 1 은 메인이 아니라 사진 읽기 스레드에서 돈다
        //    (장부로 옮기면 사진 처리가 메인 스레드로 넘어와 같은 ms 에 다른 스레드에서 일한다)
        val left = mapOf(
            "HijackService.kt" to 1,
            "core/TelemetryManager.kt" to 0, "core/AutoTouchManager.kt" to 0, "core/engine/SafeCancelTimer.kt" to 0,
            "core/AlarmSignaler.kt" to 0, "core/ScreenReader.kt" to 1, "core/engine/PreConfirmSequence.kt" to 0,
        )
        left.forEach { (f, n) -> assertEquals(f, n, count(f)) }
    }

    @Test fun `안전취소는 판결 몫 - 세션이 끝나도 장부가 지우지 않는다 · 네 부품이 장부 하나를 받는다`() {
        assertTrue(File("$root/core/engine/SafeCancelTimer.kt").readText().contains("WaitBook.DECISION"))
        val alarm = File("$root/core/AlarmSignaler.kt").readText()
        assertTrue("알람 소리 이름에 번호 — 겹친 알람이 앞 소리 풀기를 지우지 않게", alarm.contains("소리 풀기 #\$no"))
        val svc = File("$root/HijackService.kt").readText()
        listOf("TelemetryManager(apiClient, this, waitBook)", "AutoTouchManager(this, waitBook)", "SafeCancelTimer(waitBook)", "AlarmSignaler(this, waitBook)")
            .forEach { assertTrue(it, svc.contains(it)) }
    }

    @Test fun `걸린 기다림 한 줄 - 늘 도는 것은 끝에 수로만`() {
        val line = WaitBook.pendingLine(listOf(
            WaitBook.Pending("하트비트", WaitBook.SERVICE, 12_000), WaitBook.Pending("목록 감시", WaitBook.SERVICE, 300),
            WaitBook.Pending("겹친 틀 뒤 읽기", WaitBook.LIST, 150)))
        assertEquals("겹친 틀 뒤 읽기(목록 · 150ms) · +늘 도는 2", line)
        assertEquals(null, WaitBook.pendingLine(emptyList()))
        assertEquals("+늘 도는 1", WaitBook.pendingLine(listOf(WaitBook.Pending("하트비트", WaitBook.SERVICE, 1))))
    }

    @Test fun `결재 버튼은 결재 몫 · 세션이 끝나면 세션 몫을 거두고 손 클릭 AUTO 1초 보고를 끈다`() {
        val src = File("$root/HijackService.kt").readText()
        assertTrue("취소 누름을 잃지 않게 세션 몫에서 뺀다", src.contains("waitBook.schedule(\"결재 버튼\", com.onedal.app.core.WaitBook.DECISION, 500)"))
        val reset = src.substringAfter("override fun resetSessionState() {").substringBefore("\n    }")
        assertTrue(reset.contains("waitBook.cancelOwner(com.onedal.app.core.WaitBook.SESSION)"))
        assertTrue(reset.contains("setFastPoll(com.onedal.app.core.PollOwners.HAND_AUTO, false)"))
        assertFalse(File("$root/core/engine/PreConfirmSequence.kt").readText().contains("mainHandler.postDelayed"))
    }
}
