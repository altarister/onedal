package com.onedal.app.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * ⏱️ **인성 팝업 순서가 화면 알림 문에 밀리지 않게** (기사님 «팝업 여는 속도가 너무 느려졌어» · onedal-1f «가»).
 * 인성 시뮬 판정→출발지 팝업이 1.0~1.4초에서 3.2~3.6초가 됐다. 앱이 누른 뒤 새 화면을 기다리는 동안과
 * 채우기가 팝업을 기다리는 동안은 250ms 창을 두지 않는다. 앱이 결재 버튼으로 상세를 떠난 것은 손으로 세지 않는다.
 */
class ReadSpeedTest {
    private val svc = File("src/main/java/com/onedal/app/HijackService.kt").readText()

    @Test fun `앱이 기다리는 동안은 창 안이어도 곧바로 읽는다`() {
        val g = ContentGate()
        assertEquals(0L, g.onEvent(1_000L))
        g.onScanned(1_000L)
        assertEquals("앱이 안 기다리면 창 끝까지", 250L, g.onEvent(1_000L) ?: -1L)
        assertEquals("걸린 것이 있어도 앱이 기다리면 곧바로", 0L, g.onEvent(1_010L, appWaiting = true))
    }

    @Test fun `알림 길이 누르기 진행과 채우기 대기를 넘긴다`() {
        assertTrue(svc.contains("contentGate.onEvent(now, appWaiting = touchManager.awaitingScreen || session.collectState.awaitsPopup)"))
        val atm = File("src/main/java/com/onedal/app/core/AutoTouchManager.kt").readText()
        assertTrue(atm.contains("val awaitingScreen: Boolean get() = pendingTapAtMs > 0L || inFlight != null"))
    }

    @Test fun `결재 버튼으로 상세를 떠나면 앱 뒤로 가기와 같이 적는다`() {
        val i = svc.indexOf("findAndClickByText(rootNode, targetBtnStr")
        assertTrue(i > 0 && svc.substring(i, i + 400).contains("touchManager.noteAppLeft()"))
    }

    @Test fun `읽기 나눔 계측 - 훑기 처리 캐시 비운 지`() {
        assertTrue(svc.contains("⏱️ [읽기 나눔]"))
        assertTrue(svc.contains("캐시 비운 지"))
    }

    @Test fun `구간 시계 - 표시마다 앞 표시부터의 ms 를 이름별로 더한다`() {
        val r = ReadSplit()
        r.start(100L); r.mark("훑기", 130L); r.mark("판별", 180L); r.mark("훑기", 185L)
        assertEquals("훑기 35 · 판별 50", r.line())
        r.start(200L)
        assertEquals("", r.line())
    }

    @Test fun `읽기 나눔 - 알림에서 읽기까지 · 화면 바뀜 구간 · 상세 대조와 채우기`() {
        assertTrue(svc.contains("알림→읽기"))
        assertTrue(svc.contains("readSplit.line()"))
        for (m in listOf("\"판별\"", "\"모은 글자\"", "\"화면 바꿈 보고\"", "\"화면별 처리\""))
            assertTrue(m, svc.contains("markRead($m)"))
        val pre = File("src/main/java/com/onedal/app/core/engine/PreConfirmSequence.kt").readText()
        assertTrue(pre.contains("markRead(\"상세 대조\")") && pre.contains("markRead(\"채우기\")"))
    }
}
