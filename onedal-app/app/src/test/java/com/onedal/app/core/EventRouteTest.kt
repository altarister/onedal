package com.onedal.app.core

import android.view.accessibility.AccessibilityEvent
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * 🚦 **알림이 화면 읽기로 가는 길 — 한 곳** (실물 09-30 14:21:37 · 상세에서 초당 19~60번 트리 전체를 읽어 main 이 0.7~0.9초씩 붙잡혔다).
 * - 스크롤은 목록일 때만 모아 읽기(`ScrollGate`) · 다른 화면에선 아무것도 안 한다
 * - 우리 앱의 «내용 바뀜»(테두리·알람 창 다시 그리기)은 버린다 · 우리 앱 창 바뀜은 그대로(원달앱 화면은 «모름»으로 보인다)
 * - 내용 바뀜은 첫 알림 즉시 · 250ms 안의 나머지는 한 번으로(`ContentGate`) — 목록 새 콜 발견이 최악 +250ms
 */
class EventRouteTest {
    private val content = AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED
    private val state = AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED
    private val scroll = AccessibilityEvent.TYPE_VIEW_SCROLLED

    @Test fun `상세에서 스크롤 N번이면 화면 읽기 0번`() {
        repeat(30) { assertEquals(EventRoute.Route.IGNORE, EventRoute.of(scroll, isOwnApp = false, isListScreen = false)) }
        assertEquals(EventRoute.Route.SCROLL_SCAN, EventRoute.of(scroll, isOwnApp = false, isListScreen = true))
    }

    @Test fun `우리 앱의 내용 바뀜은 버리고 창 바뀜은 본다`() {
        assertEquals(EventRoute.Route.IGNORE, EventRoute.of(content, isOwnApp = true, isListScreen = true))
        assertEquals(EventRoute.Route.SCAN, EventRoute.of(state, isOwnApp = true, isListScreen = false))
        assertEquals(EventRoute.Route.SCAN, EventRoute.of(content, isOwnApp = false, isListScreen = false))
    }

    @Test fun `내용 바뀜 모으기 - 첫 알림 즉시 · 250ms 안은 한 번`() {
        val g = ContentGate()
        assertEquals(0L, g.onEvent(0)); g.onScanned(0)
        assertEquals(150L, g.onEvent(100))      // 뒤따르는 한 번을 건다
        assertEquals(null, g.onEvent(200))      // 이미 걸려 있다
        g.onScanned(250)
        assertEquals(0L, g.onEvent(600))        // 한참 뒤는 바로
    }

    @Test fun `목록 새 콜 발견은 최악 +250ms`() {
        val g = ContentGate()
        var pendingAt: Long? = null
        for (t in 0L..2000L step 7) {
            pendingAt?.let { if (t >= it) { g.onScanned(it); pendingAt = null } }
            val d = g.onEvent(t)
            if (d == 0L) g.onScanned(t)
            else if (d != null) { pendingAt = t + d; assertTrue("알림 $t 의 읽기가 ${t + d}", d <= ContentGate.WINDOW_MS) }
        }
    }
}
