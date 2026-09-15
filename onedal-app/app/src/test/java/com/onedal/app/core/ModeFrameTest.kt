package com.onedal.app.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Test

/**
 * 🖼️ **모드 테두리 색** — 막는 것: 폰 화면만 봐서는 접근성이 켜졌는지 · 어느 모드인지 알 수 없어 오작동을 못 알아챈다.
 * 색은 관제웹 모드 버튼과 같다 (녹색 알람 · 파랑 자동 · 주황 직접).
 */
class ModeFrameTest {

    @Test
    fun `알람은 녹색 · 자동은 짙은 파랑 · 직접은 주황`() {
        assertEquals(0xFF22C55E.toInt(), ModeFrame.colorOf("ALARM"))
        assertEquals(0xFF1D4ED8.toInt(), ModeFrame.colorOf("AUTO"))
        assertEquals(0xFFF97316.toInt(), ModeFrame.colorOf("MANUAL"))
    }

    @Test
    fun `모르는 모드는 직접(주황) — 서버 답을 못 받았을 때의 앱 기본값과 같다`() {
        assertEquals(ModeFrame.colorOf("MANUAL"), ModeFrame.colorOf("무엇"))
    }

    @Test
    fun `자동의 파랑은 알람 콜 띠(청록)와 다르다`() {
        assertNotEquals(0xFF00E5FF.toInt(), ModeFrame.colorOf("AUTO"))
    }
}
