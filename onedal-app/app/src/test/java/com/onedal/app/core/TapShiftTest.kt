package com.onedal.app.core

import org.junit.Assert.assertEquals
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
}
