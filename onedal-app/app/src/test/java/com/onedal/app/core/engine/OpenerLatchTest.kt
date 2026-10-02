package com.onedal.app.core.engine

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * 👆 **연 쪽은 상세를 처음 알아본 때 한 번 정한다** (기사님 «내가 클릭한 것으로 오해하나 봐» · onedal-1f «가»).
 * 인성 팝업 3장 채우기 뒤에 5초 창을 다시 재, 채우기가 느린 날 앱이 연 상세를 손 상세(미리보기)로 풀었다 — 라이브 10-01 밤 7건.
 */
class OpenerLatchTest {
    @Test fun `03-18-47 모양 - 터치 뒤 0_5초에 알아본 상세는 6_6초 뒤 판정에도 앱이 연 것`() {
        val tap = 47_875L
        val settled = DetailOwner.openerAt(null, tap, 48_405L)
        assertEquals(DetailOwner.OPENER_ALARM, settled)
        assertEquals(DetailOwner.OPENER_ALARM, DetailOwner.openerAt(settled, tap, 54_481L))
    }

    @Test fun `정해 둔 값이 없으면 지금 창으로 잰다 - 창 밖은 손`() {
        assertEquals(DetailOwner.OPENER_HAND, DetailOwner.openerAt(null, 47_875L, 54_481L))
    }

    @Test fun `상세 처리가 채우기 전에 정하고 · 콜이 끝나면 비운다 · 로그 한 번`() {
        val pre = File("src/main/java/com/onedal/app/core/engine/PreConfirmSequence.kt").readText()
        assertTrue(pre.indexOf("settleOpener()") in 0 until pre.indexOf("val filling = plugin.executePreConfirmSpecial"))
        assertTrue(pre.contains("👆 [연 쪽 정함]"))
        val ses = File("src/main/java/com/onedal/app/core/engine/SessionManager.kt").readText()
        val reset = ses.substring(ses.indexOf("fun reset("))
        assertTrue(reset.substring(0, 800).contains("settledOpener = null"))
    }
}
