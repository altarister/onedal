package com.onedal.app.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * 📜 **스크롤만으로는 픽커가 «내용 바뀜»을 안 낸다 — 스크롤 알림으로 목록을 다시 읽는다** (실물 09-30 14:16~14:18).
 * 기사님이 목록을 맨 위로 올렸는데 앱은 다음 분(목록 글자가 바뀔 때)까지 화면을 안 읽어 1분 늦게 콜을 열었다.
 * 스크롤은 알림이 쏟아지니 모은다 — 마지막 스크롤 0.3초 뒤 한 번 · 계속 스크롤해도 첫 스크롤부터 최대 1초마다 한 번은 읽는다.
 */
class ScrollGateTest {
    @Test fun `마지막 스크롤 0점3초 뒤 한 번`() {
        val g = ScrollGate()
        assertEquals(300L, g.onScroll(0))
        assertEquals(400L, g.onScroll(100))
        assertEquals(500L, g.onScroll(200))
    }

    @Test fun `계속 스크롤해도 첫 스크롤부터 1초 안에는 읽는다`() {
        val g = ScrollGate()
        g.onScroll(0)
        assertEquals(1000L, g.onScroll(900))
        g.onScanned()
        assertEquals(1800L, g.onScroll(1500))
    }

    @Test fun `접근성 설정이 스크롤 알림을 받는다`() {
        val xml = File("src/main/res/xml/accessibility_service_config.xml").readText()
        assertTrue(xml.contains("typeViewScrolled"))
    }

    @Test fun `붙는 순간 실물 배차망 목록이면 기록을 켠다`() {
        assertTrue(TargetApp.startsTraceOnAttach("com.kakaomobility.flexer", isList = true))
        assertFalse(TargetApp.startsTraceOnAttach(TargetApp.SIMULATOR_PACKAGE, isList = true))
        assertFalse(TargetApp.startsTraceOnAttach("com.kakaomobility.flexer", isList = false))
    }
}
