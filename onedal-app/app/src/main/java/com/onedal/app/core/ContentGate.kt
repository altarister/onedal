package com.onedal.app.core

import android.view.accessibility.AccessibilityEvent

/**
 * 🚦 **«내용 바뀜» 알림을 모아 화면을 읽는 때** (실물 09-30 14:21:37 · `EventRouteTest`).
 *
 * 픽커 상세는 초당 19~60번 «내용 바뀜»을 내고, 알림마다 트리 전체를 읽어 사진 뒤 일이 3.4초 밀렸다.
 * - 한동안 조용했으면 첫 알림에 **바로** 읽는다 — 목록 새 콜 발견이 늦지 않게
 * - 읽은 뒤 [WINDOW_MS] 안의 알림은 **뒤따르는 한 번**으로 모은다 — 새 콜 발견은 최악 +[WINDOW_MS]
 * 돌려주는 값: 0 = 지금 읽는다 · N = N ms 뒤 한 번 걸어라 · null = 이미 걸려 있다
 */
class ContentGate(private val windowMs: Long = WINDOW_MS) {
    companion object { const val WINDOW_MS = 250L }

    private var lastScanAtMs = Long.MIN_VALUE / 2
    private var trailingDueMs: Long? = null

    /** @param appWaiting 앱이 누른 뒤 새 화면을 기다린다 · 채우기가 팝업을 기다린다 — 창을 두지 않고 곧바로 읽는다(인성 팝업 순서 · `ReadSpeedTest`) */
    fun onEvent(nowMs: Long, appWaiting: Boolean = false): Long? {
        if (appWaiting) return 0
        if (trailingDueMs != null) return null
        if (nowMs - lastScanAtMs >= windowMs) return 0
        val due = lastScanAtMs + windowMs
        trailingDueMs = due
        return due - nowMs
    }

    /** 읽었다 — 여기서부터 [windowMs] 를 다시 센다 */
    fun onScanned(nowMs: Long) { lastScanAtMs = nowMs; trailingDueMs = null }
}

/**
 * 🚦 **접근성 알림이 화면 읽기로 가는 길 — 사실 셋으로 가른다** (`EventRouteTest`).
 * - 스크롤: 목록일 때만 모아 읽기 · 다른 화면에선 버린다
 * - 목록에서 스크롤한 지 300ms 안의 «내용 바뀜»은 버린다 — 스크롤 읽기(`ScrollGate`)가 멈춘 뒤 300ms(늦어도 1초) 안에 한 번 읽는다
 * - 우리 앱의 «내용 바뀜»(테두리·알람 창 다시 그리기)은 버린다 — 그 알림에 기대는 곳이 없다.
 *   우리 앱 «창 바뀜»은 본다 — 원달앱 화면으로 넘어간 것을 «모름»으로 알아야 한다
 * 누름·토스트 알림은 이 길 앞에서 따로 간다.
 */
object EventRoute {
    enum class Route { SCAN, SCROLL_SCAN, IGNORE }

    /** @param scrolledRecently 마지막 스크롤이 300ms 안인가(`ScrollGate.scrolledRecently`) — 목록의 내용 바뀜은 스크롤 읽기가 곧 읽는다 */
    fun of(eventType: Int, isOwnApp: Boolean, isListScreen: Boolean, scrolledRecently: Boolean = false): Route = when (eventType) {
        AccessibilityEvent.TYPE_VIEW_SCROLLED -> if (isListScreen && !isOwnApp) Route.SCROLL_SCAN else Route.IGNORE
        AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED -> if (isOwnApp || (isListScreen && scrolledRecently)) Route.IGNORE else Route.SCAN
        AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED -> Route.SCAN
        else -> Route.IGNORE
    }
}
