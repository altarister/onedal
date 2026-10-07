package com.onedal.app.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * 🗳️ **결재 판단** (`DecisionPlan`) — KEEP 이면 안전취소 타이머를 끄고(규칙 ①의 원달앱 쪽 · R24), 계약한 콜만 버튼을 누르고,
 *    체험이면 버튼을 안 누르고, 모르는 값은 아무것도 안 한다(P1-16).
 */
class DecisionPlanTest {
    private fun plan(d: String, sim: Boolean = false, contracted: Boolean = true, opened: Boolean = true) =
        DecisionPlan.of(d, modeBlocksAccept = sim, contractedByApp = contracted, openedByApp = opened)

    @Test fun `앱이 계약한 콜 — KEEP 은 닫기 · CANCEL 은 취소`() {
        assertEquals(DecisionPlan.PRESS_CLOSE, plan("KEEP"))
        assertEquals(DecisionPlan.PRESS_CANCEL, plan("CANCEL"))
    }

    @Test fun `체험 결재나 체험 모드는 계약한 콜이어도 버튼을 안 누른다`() {
        assertEquals(DecisionPlan.SIMULATED_BACK, plan("SIMULATED_KEEP"))
        assertEquals(DecisionPlan.SIMULATED_BACK, plan("SIMULATED_CANCEL"))
        assertEquals(DecisionPlan.SIMULATED_BACK, plan("KEEP", sim = true))
    }

    @Test fun `계약 안 한 콜 — 앱이 연 CANCEL 은 목록으로 · 그 밖은 머문다`() {
        assertEquals(DecisionPlan.BACK_TO_LIST, plan("CANCEL", contracted = false, opened = true))
        assertEquals(DecisionPlan.STAY, plan("KEEP", contracted = false, opened = true))
        assertEquals(DecisionPlan.STAY, plan("CANCEL", contracted = false, opened = false))   // 기사님이 손으로 연 상세 — 안 누른 방향으로 안 간다
    }

    @Test fun `모르는 값은 아무것도 안 한다 — 계약 취소로 읽지 않는다`() {
        assertEquals(DecisionPlan.IGNORE_UNKNOWN, plan("ACK"))
        assertEquals(DecisionPlan.IGNORE_UNKNOWN, plan("keep"))
    }

    @Test fun `아는 결재면 무엇이든 안전취소 타이머를 끈다 · 모르는 값은 안 끈다 (R24)`() {
        for (d in DecisionPlan.KNOWN) for (c in listOf(true, false)) assertTrue("$d · 계약 $c", plan(d, contracted = c).stopsSafeCancel)
        assertFalse(plan("ACK").stopsSafeCancel)
    }
}
