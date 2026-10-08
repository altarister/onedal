package com.onedal.app.core

import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * ⌛ **누르기 안 먹힘 — 콜마다 셈** (`TapInFlight.FailStreak` · 29 X2).
 *    같은 콜이 두 번 안 열리면 «막았다»로 내려 다시 누르지 않는다 — 사이에 다른 콜을 눌렀어도 그 콜의 셈은 이어 간다.
 *    열쇠가 하루 내내 쌓이지 않게 지우는 때는 셋: 먹혔다 · «막았다»로 넘김(부르는 쪽이 `clear`) · 목록에서 사라짐(`retainOnly`).
 */
class TapFailStreakTest {

    @Test fun `같은 것이 연달아 안 먹히면 1 · 2 로 센다`() {
        val s = TapInFlight.FailStreak()
        assertEquals(1, s.fail("A"))
        assertEquals(2, s.fail("A"))
    }

    @Test fun `다른 것이 끼어도 그 콜의 셈은 이어 간다 - A 실패 · B 실패 · A 실패면 A 는 2`() {
        val s = TapInFlight.FailStreak()
        s.fail("A"); s.fail("B")
        assertEquals(2, s.fail("A"))
        assertEquals(2, s.size)
    }

    @Test fun `먹히면 지운다`() {
        val s = TapInFlight.FailStreak()
        s.fail("A"); s.clear("A")
        assertEquals(0, s.size)
        assertEquals(1, s.fail("A"))
    }

    @Test fun `막았다로 넘긴 콜은 지운다 - 그 뒤로는 CallMemory 가 기억한다`() {
        val s = TapInFlight.FailStreak()
        s.fail("A"); s.fail("A"); s.clear("A")
        assertEquals(0, s.size)
    }

    @Test fun `목록을 읽으면 화면에 없는 콜의 열쇠를 지운다`() {
        val s = TapInFlight.FailStreak()
        s.fail("call:A"); s.fail("call:B"); s.fail("확정")
        s.retainOnly(setOf("call:B", "call:C"))
        assertEquals(1, s.size)
        assertEquals(2, s.fail("call:B"))
    }
}
