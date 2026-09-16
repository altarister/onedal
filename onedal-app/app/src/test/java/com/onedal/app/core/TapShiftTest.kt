package com.onedal.app.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * 👈 **리스트 카드는 요금 글자에서 왼쪽으로 옮겨 찍는다** (기사님 지시).
 *
 * 요금 닻은 화면 **오른쪽 아래**에 있고, 상세 화면의 **«수락하기»도 오른쪽 아래**다.
 * 화면이 상세로 바뀌는 찰나에 그 좌표를 찍으면 곧 계약이 된다 (버그 대장 #111).
 * 카드 한 줄은 전체가 눌리므로 **같은 줄에서 왼쪽으로 옮겨** 찍으면 상세로 똑같이 들어가고,
 * 화면이 먼저 바뀌어 잘못 눌려도 그 자리는 «넘기기»(계약 아님)다.
 * 🔴 화면 왼쪽 밖으로 나가지 않게 최소 x 를 지킨다 — 나가면 아무 데도 안 눌려 알람이 조용히 죽는다.
 *
 * ⏳ **자국을 보여 주려고 찍기를 미루면 그 사이에 리스트가 갱신된다** — 미룬 만큼
 *    «잰 자리»와 «누를 자리»가 벌어진다. 그래서 쏘기 직전에 다시 재서 **그대로일 때만** 쏜다.
 */
class TapShiftTest {

    @Test
    fun `요금 자리에서 왼쪽으로 옮긴다`() {
        assertEquals(681, TapShift.leftOf(981, 300))
        assertEquals(660, TapShift.leftOf(960, 300))
    }

    @Test
    fun `🔴 화면 왼쪽 밖으로는 안 나간다 - 최소 x 를 지킨다`() {
        assertEquals(TapShift.MIN_X, TapShift.leftOf(100, 300))
        assertTrue(TapShift.leftOf(0, 300) >= TapShift.MIN_X)
    }

    @Test
    fun `옮김이 0 이면 그 자리 그대로`() {
        assertEquals(981, TapShift.leftOf(981, 0))
    }

    @Test
    fun `픽커 리스트 카드의 옮김 값은 0 보다 크다 - 요금 자리를 안 찍는다`() {
        assertTrue(TapShift.PICKER_LIST_LEFT_PX > 0)
    }

    @Test
    fun `미룬 뒤 자리가 그대로면 쏜다 - 손가락 굵기만큼은 봐준다`() {
        assertTrue(TapShift.sameSpot(660, 1519, 660, 1519))
        assertTrue(TapShift.sameSpot(660, 1519, 668, 1531))
    }

    @Test
    fun `🔴 리스트가 갱신돼 자리가 밀렸으면 안 쏜다`() {
        assertFalse(TapShift.sameSpot(660, 1519, 660, 1700))
        assertFalse(TapShift.sameSpot(660, 1519, 400, 1519))
    }

    @Test
    fun `🔴 자리를 다시 못 쟀으면 안 쏜다 - 모르면 손대지 않는다`() {
        assertFalse(TapShift.sameSpot(660, 1519, null, null))
        assertFalse(TapShift.sameSpot(660, 1519, 660, null))
    }

    @Test
    fun `자국을 보여 주는 시간은 0 보다 크다`() {
        assertTrue(TapShift.PREVIEW_MS > 0)
    }
}
