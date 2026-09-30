package com.onedal.app.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** ⏱️ 상세 뒤 단계 시간 · 상세 중 화면 읽기 요약 — 모양만 잠근다 (시각 줄이라 동작은 폰에서 잰다) */
class StepClockTest {
    @Test fun `단계마다 앞 단계 끝부터 잰다 - 처음은 대기`() {
        var t = 100L
        val c = StepClock(100L) { t }
        t = 150; c.mark("대기")
        t = 160; c.mark("대조")
        t = 1460; c.mark("필터")
        assertEquals("대기 50ms · 대조 10ms · 필터 1300ms · 합 1360ms", c.line())
    }

    @Test fun `화면 읽기는 1초마다 한 줄`() {
        val s = ScanTimer()
        assertNull(s.record(30, false, 0))
        assertNull(s.record(50, true, 500))
        assertEquals("1000ms 동안 3번(같은 글자 1) · 평균 40ms · 최대 50ms · 합 120ms", s.record(40, false, 1000))
        assertNull("비운 뒤 새 창", s.record(10, false, 1200))
    }
}
