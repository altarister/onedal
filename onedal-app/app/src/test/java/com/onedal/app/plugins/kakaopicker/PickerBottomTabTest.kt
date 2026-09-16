package com.onedal.app.plugins.kakaopicker

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * 🚧 **화면 맨 아래 탭 줄보다 아래는 콜 글자가 아니다** (기사님 지시).
 *
 * 목록을 끝까지 내리면 마지막 카드가 아래 탭 줄에 바짝 붙는다. 앱은 요금 글자를 기준으로
 * 위아래 60픽셀을 한 콜로 묶는데, 그 안에 탭 글자(«신규»·«내 오더»…)가 들어오면
 * **지역 이름으로 취급된다.** 09-16 실측에서 픽업지가 «신규 내 오더»로 서버에 올라갔다.
 *
 * 낱말 목록(`uiNoiseWords`)은 **아는 글자만** 막는다. 이 선은 픽커가 탭 이름을 바꿔도 막는다 —
 * 위쪽 경계(«리스트 설정» 줄 위는 콜이 아니다 · `listHeaderCenterY`)와 짝이다.
 *
 * 🔴 탭 줄을 못 찾으면 **아무것도 버리지 않는다** — 모르면 손대지 않는다 (규칙 ④).
 */
class PickerBottomTabTest {

    private val screen = listOf(
        "리스트 설정" to 795,
        "분당 야탑3" to 2069,
        "서초 방배본" to 2069,
        "15,540" to 2102,
        "서포트모드" to 2150,
        "카드설정" to 2150,
        "신규" to 2255,
        "내 오더" to 2255,
    )

    @Test
    fun `아래 탭 줄의 맨 위 y 를 찾는다`() {
        assertEquals(2150, KakaoPickerParser.bottomTabTopY(screen))
    }

    @Test
    fun `🔴 탭 글자가 없으면 null - 0 이 아니다`() {
        assertNull(KakaoPickerParser.bottomTabTopY(listOf("리스트 설정" to 795, "15,540" to 2102)))
    }

    @Test
    fun `탭 줄보다 아래 글자는 콜 글자가 아니다`() {
        val tabTop = KakaoPickerParser.bottomTabTopY(screen)
        assertTrue(KakaoPickerParser.isBelowBottomTab(2255, tabTop))
        assertTrue("탭 글자 자신도 버린다", KakaoPickerParser.isBelowBottomTab(2150, tabTop))
    }

    @Test
    fun `탭 줄보다 위 글자는 그대로 둔다`() {
        val tabTop = KakaoPickerParser.bottomTabTopY(screen)
        assertFalse(KakaoPickerParser.isBelowBottomTab(2102, tabTop))
        assertFalse(KakaoPickerParser.isBelowBottomTab(2069, tabTop))
    }

    @Test
    fun `🔴 탭 줄을 못 찾았으면 아무것도 안 버린다`() {
        assertFalse(KakaoPickerParser.isBelowBottomTab(2255, null))
    }
}
