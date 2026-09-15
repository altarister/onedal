package com.onedal.app.plugins.kakaopicker

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * 🔴 **찍기 직전에 «머리줄 아래 리스트 카드인가»를 한 번 더 본다** (#111 틈 ①).
 *
 * #111 수리는 머리줄 판단을 **스캔할 때 잰 좌표**로 하고, 찍기 직전 `refresh()` 는 요금 칸 자리만 다시 쟀다.
 * 09-13 11:46 은 새 카드가 뜬 1초 뒤(18.034 진동 → 19.012 원달앱 터치)에 눌렀다 — 스캔과 누름 사이에 화면 구조가 바뀌면
 * 스캔 때 «리스트 카드»였던 자리가 누르는 순간에는 아닐 수 있다. 픽커는 누르면 곧 계약이고 되돌릴 창이 없다.
 * → 찍기 직전에 요금 칸 · 머리줄 **둘 다** 다시 읽어, 요금이 여전히 머리줄 아래일 때만 누른다.
 */
class PickerTapRecheckTest {

    @Test
    fun `다시 잰 요금 칸이 머리줄 아래면 누른다`() {
        assertTrue(KakaoPickerParser.stillListCardAtTap(fareRefreshedY = 1100, headerRefreshedY = 950))
    }

    @Test
    fun `🔴 다시 재니 요금 칸이 머리줄 위로 갔으면 안 누른다 - 오더카드 자리일 수 있다`() {
        assertFalse(KakaoPickerParser.stillListCardAtTap(fareRefreshedY = 900, headerRefreshedY = 950))
    }

    @Test
    fun `🔴 머리줄이나 요금 칸을 다시 못 읽으면 안 누른다 - 모르면 누르지 않는다`() {
        assertFalse("머리줄이 사라졌다", KakaoPickerParser.stillListCardAtTap(fareRefreshedY = 1100, headerRefreshedY = null))
        assertFalse("요금 칸이 사라졌다", KakaoPickerParser.stillListCardAtTap(fareRefreshedY = null, headerRefreshedY = 950))
    }

    @Test
    fun `같은 높이면 안 누른다 - 경계는 계약 쪽으로 기울지 않는다`() {
        assertFalse(KakaoPickerParser.stillListCardAtTap(fareRefreshedY = 950, headerRefreshedY = 950))
    }

    @Test
    fun `리스트 설정 칸을 머리줄로 알아본다`() {
        assertTrue(KakaoPickerParser.isListHeaderText("리스트 설정"))
        assertFalse(KakaoPickerParser.isListHeaderText("16,870"))
    }
}
