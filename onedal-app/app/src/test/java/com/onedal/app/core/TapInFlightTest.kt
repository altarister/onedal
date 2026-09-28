package com.onedal.app.core

import com.onedal.app.core.TapInFlight.Record
import com.onedal.app.core.TapInFlight.Verdict
import com.onedal.app.models.ScreenContext
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * 👆 **누른 뒤 먹혔나 — 어느 화면이든 같은 규칙** (기사님 «어떤 페이지든»)
 * 문제지: 09-29 01:06:56 이천 모의 주행 — 적요 «닫기» 뒤 상세 알림이 47ms 간격으로 두 번 와서 «출발지»를 두 번 눌렀다.
 */
class TapInFlightTest {

    private val detail = ScreenContext.DETAIL_PRE_CONFIRM
    private val popup = ScreenContext.POPUP_PICKUP
    private fun rec(key: String = "출발지", screen: ScreenContext = detail, at: Long = 1_000L, completed: Boolean = false, refired: Boolean = false, seq: Long = 1) =
        Record(seq, key, screen, at, completed, refired)

    @Test fun `오늘 사고 - 같은 무엇 같은 화면 47ms 뒤 둘째는 보내지 않는다`() =
        assertTrue(TapInFlight.blocks(rec(), "출발지", detail, 1_047L))

    @Test fun `닫기 뒤 출발지 - 다른 무엇은 막지 않는다 (팝업 순회)`() =
        assertFalse(TapInFlight.blocks(rec(key = "닫기", screen = ScreenContext.POPUP_MEMO), "출발지", detail, 1_200L))

    @Test fun `같은 목록 줄 두 번 - 콜 지문이 같으면 둘째를 보내지 않는다`() =
        assertTrue(TapInFlight.blocks(rec(key = "call:123", screen = ScreenContext.LIST), "call:123", ScreenContext.LIST, 1_500L))

    @Test fun `화면 종류가 바뀌면 먹혔다`() =
        assertEquals(Verdict.TAKEN, TapInFlight.judge(rec(), popup, textChanged = true, nowMs = 1_300L))

    @Test fun `종류는 같은데 글자만 바뀌면 판정하지 않는다 (반쯤 열린 팝업 · 새로고침)`() =
        assertEquals(Verdict.NONE, TapInFlight.judge(rec(completed = true), detail, textChanged = true, nowMs = 3_000L))

    @Test fun `끝났다는 알림 전에는 같은 화면이 와도 판정하지 않는다 (47ms 이중 알림을 실패로 읽지 않는다)`() =
        assertEquals(Verdict.NONE, TapInFlight.judge(rec(), detail, textChanged = false, nowMs = 1_047L))

    /** 뒤로 가기는 누르는 순간 «끝남»이다 — 화면이 움직이는 0.3~0.5초 사이 같은 글자 알림을 실패로 읽으면 또 누른다 */
    @Test fun `끝났다 직후 같은 글자 알림은 아직 판정하지 않는다 (누른 앱이 화면을 바꿀 시간)`() =
        assertEquals(Verdict.NONE, TapInFlight.judge(rec(completed = true), detail, textChanged = false, nowMs = 1_000L + 300L))

    @Test fun `끝났는데 종류도 글자도 그대로면 안 먹혔다`() =
        assertEquals(Verdict.NOT_TAKEN, TapInFlight.judge(rec(completed = true), detail, textChanged = false, nowMs = 3_500L))

    @Test fun `끝났다는 알림이 사라져도 5초 뒤엔 스스로 푼다`() {
        assertEquals(Verdict.EXPIRED, TapInFlight.judge(rec(), detail, textChanged = false, nowMs = 1_000L + TapInFlight.SETTLE_MAX_MS))
        assertFalse(TapInFlight.blocks(rec(), "출발지", detail, 1_000L + TapInFlight.SETTLE_MAX_MS))
    }

    @Test fun `시스템이 무시하면 한 번만 다시 누른다`() {
        assertTrue(TapInFlight.shouldRefire(rec(), callbackSeq = 1, screenNow = detail))
        assertFalse("두 번째 무시는 실패", TapInFlight.shouldRefire(rec(refired = true), callbackSeq = 1, screenNow = detail))
    }

    @Test fun `늦게 온 무시 알림 - 다른 누르기로 바뀌었거나 화면이 넘어갔으면 다시 누르지 않는다`() {
        assertFalse("기록이 바뀌었다", TapInFlight.shouldRefire(rec(seq = 2), callbackSeq = 1, screenNow = detail))
        assertFalse("화면이 넘어갔다", TapInFlight.shouldRefire(rec(), callbackSeq = 1, screenNow = popup))
    }

    private fun codeOnly(path: String) = File(path).readText()
        .replace(Regex("/\\*[\\s\\S]*?\\*/"), "").replace(Regex("//.*"), "")
    private val root = "src/main/java/com/onedal/app"

    @Test
    fun `연결 - 모든 누르기가 지나는 한 곳에서 기록하고, 화면 알림 두 갈래가 판정을 부른다`() {
        val touch = codeOnly("$root/core/AutoTouchManager.kt")
        assertTrue("누르기 전에 같은 누름을 막지 않는다", touch.contains("TapInFlight.blocks("))
        assertTrue("무시됨에 다시 누르기 규칙을 안 쓴다", touch.contains("TapInFlight.shouldRefire("))
        val svc = codeOnly("$root/HijackService.kt")
        assertTrue("글자가 그대로인 알림이 판정을 안 부른다", Regex("""fingerprint == lastScreenFingerprint\)\s*\{[^}]*touchManager\.onScreen\(""").containsMatchIn(svc))
        assertTrue("목록 줄 누르기가 콜 지문을 무엇으로 넘기지 않는다", svc.contains("tapKey = \"call:"))
    }
}
