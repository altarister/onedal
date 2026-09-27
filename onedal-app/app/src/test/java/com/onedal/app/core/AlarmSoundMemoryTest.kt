package com.onedal.app.core

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * 🔔 **알람은 콜당 한 번 운다** — 앱이 못 들어가는 콜(픽커 오더카드 등)은 기억에 안 들어가 매 스캔 다시 통과한다.
 * 소리까지 매 스캔 나면 폰이 1초마다 울린다. 그래서 «소리 낸 지문»을 알람 쪽이 따로 기억하고,
 * 목록에서 사라졌다 다시 오면 새 콜로 다시 운다.
 */
class AlarmSoundMemoryTest {

    @Test
    fun `같은 지문은 한 번만 운다`() {
        val m = AlarmSignaler.SoundMemory()
        assertTrue(m.firstTime(42))
        assertFalse(m.firstTime(42))
        assertFalse(m.firstTime(42))
    }

    @Test
    fun `목록에서 사라졌다 다시 오면 다시 운다`() {
        val m = AlarmSignaler.SoundMemory()
        assertTrue(m.firstTime(42))
        m.keepOnly(setOf(7))          // 이번 스캔에 42 가 없다
        assertTrue(m.firstTime(42))
    }

    @Test
    fun `목록에 남아 있으면 잊지 않는다`() {
        val m = AlarmSignaler.SoundMemory()
        assertTrue(m.firstTime(42))
        m.keepOnly(setOf(42, 7))
        assertFalse(m.firstTime(42))
    }
}
