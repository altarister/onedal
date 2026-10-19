package com.onedal.app.core

import com.onedal.app.plugins.DispatchPluginRegistry
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * 🛡️ **잡은 뒤 결재로 누를 글자 · 잡기 전 물러날 글자는 그 배차망 정의 표의 단추 한 곳** (38 F36 · F38) — 박아 둔 «취소»가 다른 배차망에서 엉뚱한 것을 누르거나 못 찾던 것.
 * 결재 글자는 그 배차망 확정 기준 페이지의 `buttons` — 화물24시는 신청하면 같은 화면에 머물러 «닫기»가 없고, 위 «배차취소하기» 막대는 아직 누르지 않는다 — 없음(null).
 * 못 잡는 것: 그 글자가 실제 화면에 있나 — 폰.
 */
class DecisionWordTest {
    @Test fun `🔴 인성은 닫기 · 취소 · 화물24시 · 픽커는 없음`() {
        assertEquals("닫기", DecisionWord.of(DecisionPlan.PRESS_CLOSE, null, TargetApp.INSUNG))
        assertEquals("취소", DecisionWord.of(DecisionPlan.PRESS_CANCEL, null, TargetApp.INSUNG))
        assertNull(DecisionWord.of(DecisionPlan.PRESS_CLOSE, null, TargetApp.HWAMUL24))
        assertNull(DecisionWord.of(DecisionPlan.PRESS_CANCEL, null, TargetApp.HWAMUL24))
        assertNull(DecisionWord.of(DecisionPlan.PRESS_CANCEL, null, TargetApp.KAKAOPICKER))
        assertNull(DecisionWord.of(DecisionPlan.STAY, null, TargetApp.INSUNG))
    }

    @Test fun `🔴 지키는 계약의 배차망 글자 - 계약이 인성이면 지금 화면이 화물24시여도 닫기 · 취소`() {
        assertEquals("닫기", DecisionWord.of(DecisionPlan.PRESS_CLOSE, TargetApp.INSUNG, TargetApp.HWAMUL24))
        assertEquals("취소", DecisionWord.of(DecisionPlan.PRESS_CANCEL, TargetApp.INSUNG, TargetApp.HWAMUL24))
        assertNull(DecisionWord.of(DecisionPlan.PRESS_CANCEL, TargetApp.HWAMUL24, TargetApp.INSUNG))
    }

    @Test fun `🔴 잡기 전 상세에서 물러날 글자 - 인성 취소 · 화물24시 돌아가기 · 픽커 넘기기`() {
        assertEquals("취소", buttonsOn(DispatchPluginRegistry.get(TargetApp.INSUNG).screens, "detail")?.filterOut)
        assertEquals("돌아가기", buttonsOn(DispatchPluginRegistry.get(TargetApp.HWAMUL24).screens, "detail")?.filterOut)
        assertEquals("넘기기", buttonsOn(DispatchPluginRegistry.get(TargetApp.KAKAOPICKER).screens, "detail")?.filterOut)
    }
}
