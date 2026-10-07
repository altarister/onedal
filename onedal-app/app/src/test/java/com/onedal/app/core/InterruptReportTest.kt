package com.onedal.app.core

import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Test

/** ⚡ **끼어들기 빈도** (`InterruptReport`) — 한 시간에 한 번 · 그 사이 온 수를 싣는다 */
class InterruptReportTest {
    private val got = mutableListOf<Int>()
    @After fun unhook() { InterruptReport.sink = null }

    @Test fun `처음은 바로 · 한 시간 안의 것은 모았다가 다음 시간에 수와 함께`() {
        InterruptReport.sink = { got += it }
        val t0 = 1_000_000_000_000L   // 다른 검사와 겹치지 않는 먼 시각에서 시작
        InterruptReport.record(t0)
        InterruptReport.record(t0 + 60_000); InterruptReport.record(t0 + 120_000)
        InterruptReport.record(t0 + 60 * 60_000L)
        assertEquals(listOf(1, 3), got)
    }
}
