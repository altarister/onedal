package com.onedal.app.core

import com.onedal.app.models.SimplifiedOfficeOrder
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * 🧹 **서버 회차가 오르면 «본 콜» 기억과 «같은 길» 기억을 함께 비운다** (38 F32 · 기사님 «가»).
 * 회차는 영업일(자정) · 시뮬 «다시 시작»에 오른다. «본 콜»만 비우면 콜은 새로 판정하는데 «같은 길»이 «이미 연 길»로 상세를 막는다.
 * 못 잡는 것: `HijackService` 회차 콜백 배선 — 폰 G1(R0 → 콜만으로 같은 길에 안 막힘).
 */
class RoundResetTest {
    private val call = SimplifiedOfficeOrder(id = "c", pickup = "초월읍", dropoff = "신둔면", fare = 28000, timestamp = "t", pickupDistance = 5.0)
    private val hash = CallMemory.fingerprintOf(call)

    private fun opened(): Pair<CallMemory, AlarmedRoutes> {
        val memory = CallMemory(); val routes = AlarmedRoutes()
        memory.markEvaluated(hash)
        routes.markOpened(call, 0)
        return memory to routes
    }

    @Test fun `🔴 회차가 바뀌면 두 기억이 함께 빈다`() {
        val (memory, routes) = opened()
        assertFalse(RoundReset.apply(1001, memory, routes))   // 처음 받은 회차는 기억만
        assertTrue(RoundReset.apply(1002, memory, routes))
        assertFalse("본 콜 기억", memory.alreadyEvaluated(hash))
        assertFalse("같은 길 — 다시 연다", routes.opened(call))
        assertTrue("같은 길 — 새로 적는다", routes.notePassing(call, 1))
    }

    @Test fun `처음 받은 회차 · 같은 회차는 둘 다 그대로`() {
        val (memory, routes) = opened()
        assertFalse(RoundReset.apply(1001, memory, routes))
        assertFalse(RoundReset.apply(1001, memory, routes))
        assertTrue(memory.alreadyEvaluated(hash))
        assertTrue(routes.opened(call))
    }
}
