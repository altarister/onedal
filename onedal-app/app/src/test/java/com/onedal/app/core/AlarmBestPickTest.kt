package com.onedal.app.core

import org.junit.Assert.assertEquals
import org.junit.Test

/** 🥇 한 스캔에 여러 콜이 같이 통과하면 요금 최고 하나만 연다 (`AlarmSignaler.pickBestIndex` · 기사님 확정) */
class AlarmBestPickTest {
    @Test
    fun `동시 통과 여러 건이면 요금 최고 하나만 - 상세 자동 진입의 대상`() {
        assertEquals(0, AlarmSignaler.pickBestIndex(listOf(16478, 8316, 14476)))
        assertEquals(2, AlarmSignaler.pickBestIndex(listOf(5600, 8316, 14476)))
        assertEquals(0, AlarmSignaler.pickBestIndex(listOf(9000, 9000)))   // 같으면 먼저 본 콜
        assertEquals(-1, AlarmSignaler.pickBestIndex(emptyList()))
    }
}
