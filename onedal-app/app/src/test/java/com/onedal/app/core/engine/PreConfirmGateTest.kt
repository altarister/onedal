package com.onedal.app.core.engine

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * 🧪 **확정 전 화면 처리를 건너뛰는 것은 «이미 선점 보고를 했다» 하나뿐이다**
 *
 * 인성은 팝업 3장으로 채운 뒤 상세로 돌아와서야 보고한다(배차망_모드표.md 순서 ③~⑥).
 * 채우는 동안 건너뛰면 돌아온 상세가 보고 없이 멈춘다.
 */
class PreConfirmGateTest {

    @Test
    fun `보고를 마쳤으면 건너뛴다 - 중복 처리 방지`() {
        assertTrue(PreConfirmGate.shouldSkip(isDetailScrapSent = true))
    }

    @Test
    fun `아직 보고 전이면 처리한다 - 채우고 돌아온 상세도 여기로 온다`() {
        assertFalse(PreConfirmGate.shouldSkip(isDetailScrapSent = false))
    }
}
