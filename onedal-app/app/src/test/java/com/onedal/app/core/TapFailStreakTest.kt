package com.onedal.app.core

import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * ⌛ **누르기 안 먹힘 연속 셈** (`TapInFlight.FailStreak`) — 보고에 싣는 실측 재료다(누르기 상한에는 안 쓴다).
 *    다시 안 누른 콜의 열쇠가 하루 내내 쌓이지 않게, 지금 누르는 것 하나만 든다.
 */
class TapFailStreakTest {

    @Test fun `같은 것이 연달아 안 먹히면 1 · 2 로 센다`() {
        val s = TapInFlight.FailStreak()
        assertEquals(1, s.fail("A"))
        assertEquals(2, s.fail("A"))
    }

    @Test fun `다른 것이 안 먹히면 앞의 열쇠를 버린다 - 표는 하나만 든다`() {
        val s = TapInFlight.FailStreak()
        s.fail("A"); s.fail("B")
        assertEquals(1, s.size)
    }

    @Test fun `다른 것이 끼면 다시 1부터 센다`() {
        val s = TapInFlight.FailStreak()
        s.fail("A"); s.fail("B")
        assertEquals(1, s.fail("A"))
    }

    @Test fun `먹히면 지운다`() {
        val s = TapInFlight.FailStreak()
        s.fail("A"); s.clear("A")
        assertEquals(0, s.size)
        assertEquals(1, s.fail("A"))
    }
}
