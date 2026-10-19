package com.onedal.app.core

import com.onedal.app.plugins.hwamul24.Hwamul24Keywords
import com.onedal.app.plugins.insung.InsungKeywords
import com.onedal.app.plugins.kakaopicker.KakaoPickerKeywords
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * 🛡️ **잡은 뒤 결재로 누를 글자는 그 배차망 낱말 한 곳** (38 F36 · F38) — 박아 둔 «취소»가 다른 배차망에서 엉뚱한 것을 누르거나 못 찾던 것.
 * 화물24시는 신청하면 같은 화면에 머물러 «닫기»가 없고, 위 «배차취소하기» 막대는 아직 누르지 않는다 — 없음(null).
 * 못 잡는 것: 그 글자가 실제 화면에 있나 — 폰.
 */
class DecisionWordTest {
    @Test fun `🔴 인성은 닫기 · 취소 · 화물24시 · 픽커는 없음`() {
        assertEquals("닫기", DecisionWord.of(DecisionPlan.PRESS_CLOSE, InsungKeywords.INSUNG))
        assertEquals("취소", DecisionWord.of(DecisionPlan.PRESS_CANCEL, InsungKeywords.INSUNG))
        assertNull(DecisionWord.of(DecisionPlan.PRESS_CLOSE, Hwamul24Keywords.TWENTYFOUR))
        assertNull(DecisionWord.of(DecisionPlan.PRESS_CANCEL, Hwamul24Keywords.TWENTYFOUR))
        assertNull(DecisionWord.of(DecisionPlan.PRESS_CANCEL, KakaoPickerKeywords.PICKER))
        assertNull(DecisionWord.of(DecisionPlan.STAY, InsungKeywords.INSUNG))
    }
}
