package com.onedal.app.core

import com.onedal.app.models.FilterConfig
import com.onedal.app.plugins.hwamul24.Hwamul24Plugin
import com.onedal.app.plugins.insung.InsungPlugin
import com.onedal.app.plugins.kakaopicker.KakaoPickerPlugin
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * ⚙️ **배차망 규칙 넷은 정의 표에서 온다 — 옮기기 전 플러그인 값과 같다** (59 5단계 · 값이 같아야 운행 동작이 안 바뀐다).
 * 되는 모드 · 패키지 글자 · 안전취소 설정 칸 · 상세 머묾 설정 칸 — shared `networkPages.<배차망>.ts` → 생성 파일 → 플러그인.
 * 기댓값은 옮기기 전 플러그인에 손으로 적혀 있던 값이다.
 * 못 잡는 것: 표를 일부러 바꾼 경우(그때는 이 검사도 함께 고친다 — 운행 동작이 바뀌는 일이라 기사님께 먼저).
 */
class NetworkRulesFromTableTest {
    private val filter = FilterConfig(safeCancelSecInsung = 41, safeCancelSecHwamul24 = 42, pickerAlarmDetailSec = 43)

    @Test
    fun `되는 모드 — 픽커만 자동이 없다`() {
        assertEquals(TargetApp.ALL_MODES, InsungPlugin().availableModes)
        assertEquals(TargetApp.ALL_MODES, Hwamul24Plugin().availableModes)
        assertEquals(TargetApp.ALL_MODES - "AUTO", KakaoPickerPlugin().availableModes)
    }

    @Test
    fun `패키지 글자`() {
        assertEquals(listOf("insung"), InsungPlugin().packageKeywords)
        assertEquals(listOf("logione", "carrier"), Hwamul24Plugin().packageKeywords)
        assertEquals(listOf("flexer"), KakaoPickerPlugin().packageKeywords)
    }

    @Test
    fun `안전취소 · 상세 머묾 — 그 배차망 설정 칸 · 없으면 null`() {
        assertEquals(41_000L, InsungPlugin().getSafeCancelMs(filter))
        assertEquals(42_000L, Hwamul24Plugin().getSafeCancelMs(filter))
        assertNull(KakaoPickerPlugin().getSafeCancelMs(filter))
        assertNull(InsungPlugin().getDetailBackTimeoutMs(filter))
        assertNull(Hwamul24Plugin().getDetailBackTimeoutMs(filter))
        assertEquals(43_000L, KakaoPickerPlugin().getDetailBackTimeoutMs(filter))
    }
}
