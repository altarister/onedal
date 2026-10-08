package com.onedal.app.core

import com.onedal.app.api.DetailFailure
import org.junit.Assert.assertEquals
import org.junit.Test
import java.util.concurrent.Executor

/**
 * 🧵 **상세 보고 실패는 받은 실행기를 거쳐 알린다** (29 X5 · P1-04) — `ApiClient` 는 화면 스레드 실행기를 넘긴다.
 *    실패 콜백(`executeDecisionImmediately`)이 만지는 상태(`WaitBook` · 세션)는 화면 스레드 전용이라, 보내는 스레드에서 곧바로 부르면 안 된다.
 * 못 잡는 것: `ApiClient` 가 실제로 화면 스레드 실행기를 넘기나(그 한 줄은 코드로 본다 · 폰에서 실패 로그 순서).
 */
class DetailFailureTest {
    private class Recording : Executor {
        val queued = mutableListOf<Runnable>()
        override fun execute(command: Runnable) { queued += command }
    }

    @Test fun `실행기가 돌기 전에는 콜백을 안 부르고 · 돌면 그 콜을 CANCEL 로 부른다`() {
        val ex = Recording()
        val got = mutableListOf<Pair<String, String>>()
        DetailFailure.notify(ex, "call-1") { id, d -> got += id to d }
        assertEquals(emptyList<Pair<String, String>>(), got)
        assertEquals(1, ex.queued.size)
        ex.queued.single().run()
        assertEquals(listOf("call-1" to "CANCEL"), got)
    }
}
