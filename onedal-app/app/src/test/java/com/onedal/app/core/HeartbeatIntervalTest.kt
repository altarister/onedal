package com.onedal.app.core

import com.onedal.app.models.ScreenContext
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * ⏱️ **생존 보고 간격 — 목록 화면 15초** (실물 픽커 09-30 02:52 · onedal-1f «가»)
 * 차가 서 있고 콜이 적어 목록이 멈추면, 기사님이 바꾼 필터가 60초 생존 보고에만 실려 79초 뒤에 닿았다.
 */
class HeartbeatIntervalTest {

    @Test fun `결재 대기 1초 · 목록 15초 · 그 밖 60초`() {
        assertEquals(1_000L, TelemetryManager.heartbeatIntervalMs(waitingDecision = true, screen = ScreenContext.LIST))
        assertEquals(15_000L, TelemetryManager.heartbeatIntervalMs(waitingDecision = false, screen = ScreenContext.LIST))
        assertEquals(60_000L, TelemetryManager.heartbeatIntervalMs(waitingDecision = false, screen = ScreenContext.DETAIL_PRE_CONFIRM))
        assertEquals(60_000L, TelemetryManager.heartbeatIntervalMs(waitingDecision = false, screen = ScreenContext.UNKNOWN))
    }

    @Test fun `다음 생존 보고 예약은 이 규칙 한 곳을 쓴다`() {
        val src = File("src/main/java/com/onedal/app/core/TelemetryManager.kt").readText()
        val reset = src.substringAfter("private fun resetHeartbeatTimer(").substringBefore("\n    }")
        assertTrue(reset.contains("heartbeatIntervalMs("))
    }
}
