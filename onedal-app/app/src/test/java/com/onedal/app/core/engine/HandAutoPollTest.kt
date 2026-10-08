package com.onedal.app.core.engine

import com.onedal.app.core.ModeActs
import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * ⚡ **사실 ③ — «손 클릭 AUTO» 1초 보고 10초의 지금 답** (31 P0 A6 · 29 N4 «지금» 칸).
 * P2 에서 «확정 누른 주체»로 정리되면 이 기댓값이 바뀐다.
 * 못 잡는 것: 켠 뒤 10초에 끄는 배선(67판 폰 확인 ③).
 */
class HandAutoPollTest {
    @Test fun `원달앱이 계약 안 하는 콜이고 지금 모드가 자동일 때만 켠다`() {
        val got = listOf("AUTO", "ALARM", "MANUAL", "SIMULATION").associateWith { m ->
            listOf(false, true).map { contracted -> HandAutoPoll.wanted(contracted, ModeActs.of(m).contracts) }
        }
        assertEquals(mapOf(
            "AUTO" to listOf(true, false),
            "ALARM" to listOf(false, false),
            "MANUAL" to listOf(false, false),
            "SIMULATION" to listOf(false, false),
        ), got)
    }
}
