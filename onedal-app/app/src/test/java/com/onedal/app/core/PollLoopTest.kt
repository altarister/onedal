package com.onedal.app.core

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.concurrent.atomic.AtomicInteger

/**
 * 🔁 **화면 1초 읽기는 끌 수 있다** (29 X5 · P1-12) — 원달앱 화면이 사라지면 끄고, 다시 켜도 루프는 하나다.
 *    끄는 곳이 없으면 화면이 다시 만들어질 때마다 루프가 하나씩 는다.
 * 못 잡는 것: 원달앱 화면이 실제로 사라질 때 `stop` 을 부르나(`MainActivity` 의 DisposableEffect — 폰에서 설정 탭 열고 닫기).
 */
class PollLoopTest {
    @Test fun `끄면 더 안 읽는다`() = runBlocking {
        val scope = CoroutineScope(Dispatchers.Default + SupervisorJob())
        val n = AtomicInteger()
        val loop = PollLoop(scope, 10) { n.incrementAndGet() }
        loop.start(); delay(80); loop.stop()
        val after = n.get(); delay(80)
        assertTrue(after > 0)
        assertEquals(after, n.get())
        scope.cancel()
    }

    @Test fun `두 번 켜도 루프는 하나`() = runBlocking {
        val scope = CoroutineScope(Dispatchers.Default + SupervisorJob())
        val n = AtomicInteger()
        val loop = PollLoop(scope, 1000) { n.incrementAndGet() }
        loop.start(); loop.start(); delay(100)
        assertEquals(1, n.get())
        loop.stop(); scope.cancel()
    }
}
