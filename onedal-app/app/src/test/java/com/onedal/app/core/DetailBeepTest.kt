package com.onedal.app.core

import com.onedal.app.models.ScreenContext
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * 🔔 **소리 셋 가운데 둘 — 원달앱 폰** (29 P4 · N5 · N6 ② · 기사님 Q7 «가»).
 * 삑: 서버가 상세 보고를 받았다고 답하면 그 콜에 한 번 · 반복: 서버가 «이 폰이 울릴 콜»로 준 콜의 확정 전 상세에 있는 동안 2초마다.
 * 못 잡는 것: 소리 · 진동 자체(`AlarmSignaler` · 안드로이드) · 2초 기다림을 거는 배선(폰 시험).
 */
class DetailBeepTest {
    @Test fun `삑 — 받은 콜에 한 번 · 같은 콜 두 번째는 없음 · 콜 번호가 없으면 없음`() {
        assertTrue(DetailBeep.wanted("o1", lastBeeped = null))
        assertFalse(DetailBeep.wanted("o1", lastBeeped = "o1"))
        assertTrue(DetailBeep.wanted("o2", lastBeeped = "o1"))
        assertFalse(DetailBeep.wanted("", lastBeeped = null))
    }

    @Test fun `반복 — 울릴 콜이 지금 콜이고 확정 전 상세일 때만`() {
        assertTrue(PreviewRing.rings("o1", "o1", ScreenContext.DETAIL_PRE_CONFIRM))
        assertFalse("울릴 콜 없음(결재 · 상세 떠남으로 칸이 빠짐)", PreviewRing.rings(null, "o1", ScreenContext.DETAIL_PRE_CONFIRM))
        assertFalse("다른 콜", PreviewRing.rings("o2", "o1", ScreenContext.DETAIL_PRE_CONFIRM))
        for (s in ScreenContext.values().filter { it != ScreenContext.DETAIL_PRE_CONFIRM })
            assertFalse("$s — 목록 · 확정 화면이면 멈춤", PreviewRing.rings("o1", "o1", s))
    }

    @Test fun `반복 간격은 2초 — 코드 상수(설정창 없음 · 34 여쭐 것 3)`() {
        assertEquals(2_000L, PreviewRing.EVERY_MS)
    }
}
