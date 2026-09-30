package com.onedal.app.plugins.kakaopicker

import com.onedal.app.core.TargetApp
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * 🏁 **«방금 배정된 오더입니다» — 다른 기사가 먼저 가져갔다** (실물 09-30 13:08:45 · 26,950원 · 발견→누름 141ms).
 * 픽커 토스트는 화면 글자(트리)가 아니라 알림 이벤트로 온다 — 받아서 «먼저 가져감»으로 센다.
 * 픽커·시뮬 앱의 알림만 본다 — 다른 앱 알림은 글자를 남기지 않는다(개인정보).
 */
class PickerTakenToastTest {
    @Test fun `배정 토스트를 알아본다`() {
        assertTrue(KakaoPickerKeywords.isTakenToast("방금 배정된 오더입니다"))
        assertTrue(KakaoPickerKeywords.isTakenToast("이미 배정이 완료된 오더입니다"))
        assertFalse(KakaoPickerKeywords.isTakenToast("오더카드 대기 중..."))
        assertFalse(KakaoPickerKeywords.isTakenToast(""))
    }

    @Test fun `픽커와 시뮬 앱의 알림만 본다`() {
        assertTrue(TargetApp.isPickerToastSource("com.kakaomobility.flexer"))
        assertTrue(TargetApp.isPickerToastSource(TargetApp.SIMULATOR_PACKAGE))
        assertFalse(TargetApp.isPickerToastSource("com.kakao.talk"))
        assertFalse(TargetApp.isPickerToastSource(null))
    }
}
