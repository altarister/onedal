package com.onedal.app.core.engine

import com.onedal.app.models.SimplifiedOfficeOrder
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * ✍️ **앱이 확정을 누르나 — 자동 모드 · 수락 칸이 있는 배차망 · 오늘 콜** (예약콜 1단계 C5 · 기사님 «가»).
 * 내일 콜은 자동 모드여도 앱이 누르지 않는다 — 미리보기로 올리고 기사님이 확정한다.
 * 목록 값이 오늘이어도 **확정 직전 상세 값**이 내일이면 누르지 않는다 (픽커 사진처럼 상세가 날을 알려 준다).
 */
class AppPressesAcceptTest {
    private fun call(reserved: Boolean?, day: Int?) = SimplifiedOfficeOrder(
        id = "c", pickup = "a", dropoff = "b", fare = 30000, timestamp = "t", reserved = reserved, reservedDay = day)
    private val buttons = listOf("확정")

    @Test fun `오늘 콜 · 보통 콜은 누른다`() {
        assertTrue(appPressesAccept(true, buttons, call(null, null)))
        assertTrue(appPressesAccept(true, buttons, call(true, 0)))
    }

    @Test fun `내일 콜 · 날 모름은 자동이어도 누르지 않는다`() {
        assertFalse(appPressesAccept(true, buttons, call(true, 1)))
        assertFalse(appPressesAccept(true, buttons, call(true, null)))
    }

    @Test fun `앱이 계약하지 않는 콜 · 수락 칸 없는 배차망은 누르지 않는다`() {
        assertFalse(appPressesAccept(false, buttons, call(null, null)))
        assertFalse(appPressesAccept(true, null, call(null, null)))
    }

    /** 🚪 상세 진입 줄은 모드가 아니라 «앱이 계약하나»(자동이고 오늘 콜) 하나로 말한다 */
    @Test fun `진입 줄 - 자동이어도 내일 콜이면 기사님 확정(미리보기)을 말한다`() {
        assertTrue(appContractsOnOpen("AUTO", call(null, null)))
        assertFalse(appContractsOnOpen("AUTO", call(true, 1)))
        assertFalse(appContractsOnOpen("MANUAL", call(null, null)))
        assertEquals("앱이 채우고 확정", openPlanText("AUTO", true))
        assertEquals("📅 내일 콜 — 앱이 채우고 확정은 기사님(미리보기)", openPlanText("AUTO", false))
        assertEquals("판정만 받고 확정·수락은 기사님", openPlanText("MANUAL", false))
    }
}
