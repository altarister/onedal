package com.onedal.app.core.engine

import com.onedal.app.models.FilterConfig
import com.onedal.app.models.ScreenContext
import com.onedal.app.plugins.hwamul24.Hwamul24Plugin
import com.onedal.app.plugins.insung.InsungPlugin
import com.onedal.app.plugins.kakaopicker.KakaoPickerPlugin
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * ⏱️ **사실 ① 진입 주체 · ② 지금 페이지 — 상세 대기의 지금 답** (31 P0 A1~A5 · 29 N2 · N3 «지금» 칸).
 * 세 배차망 모두, 누가 상세로 진입시켰든 원달앱이 계약하지 않는 콜이면 대기 뒤 목록으로(29 P3 · 27 7줄 «픽커처럼»).
 * 못 잡는 것: 서비스가 이 함수를 부르는 배선(67판 폰 확인 ①) · 뒤로 가기 누름 자체.
 */
class DetailBackPolicyTest {
    private val filter = FilterConfig()

    @Test fun `상세 대기 시간을 따로 주는 배차망은 픽커뿐 — 인성 · 화물24시는 안전취소 시간을 쓴다(WaitTimes)`() {
        assertNotNull(KakaoPickerPlugin().getDetailBackTimeoutMs(filter))
        assertNull(InsungPlugin().getDetailBackTimeoutMs(filter))
        assertNull(Hwamul24Plugin().getDetailBackTimeoutMs(filter))
    }

    @Test fun `대기 걸기 — 세 배차망 모두 · 누가 진입시켰든 원달앱이 계약하지 않는 콜이면 건다`() {
        assertTrue("기사님이 · 원달앱이 진입시킨 상세 모두", DetailBackPolicy.arms(contractedByApp = false))
        assertFalse("원달앱이 계약하는 콜은 결재를 기다린다", DetailBackPolicy.arms(contractedByApp = true))
    }

    @Test fun `시간이 되면 — 확정 전 상세이고 원달앱이 계약하지 않는 콜만 뒤로`() {
        assertTrue(DetailBackPolicy.fires(ScreenContext.DETAIL_PRE_CONFIRM, contractedByApp = false))
        assertFalse("원달앱이 계약하는 콜", DetailBackPolicy.fires(ScreenContext.DETAIL_PRE_CONFIRM, contractedByApp = true))
        for (s in ScreenContext.values().filter { it != ScreenContext.DETAIL_PRE_CONFIRM })
            assertFalse("$s", DetailBackPolicy.fires(s, contractedByApp = false))
    }

    @Test fun `결재가 오면 — 기사님이 연 상세만 대기를 푼다`() {
        assertTrue(DetailBackPolicy.stopsOnDecision(openedByApp = false))
        assertFalse(DetailBackPolicy.stopsOnDecision(openedByApp = true))
    }

    @Test fun `결재 뒤 뒤로 — 확정 전 상세일 때만 누른다`() {
        assertEquals(
            listOf(ScreenContext.DETAIL_PRE_CONFIRM),
            ScreenContext.values().filter { BackGuard.onPreConfirm(it) },
        )
    }
}
