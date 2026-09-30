package com.onedal.app.core

/**
 * ⏱️ **한 사건의 단계별 시간** — «상세 뒤 1.3초가 어디서 비나»를 한 줄로 가른다 (라이브 09-30 12:57 · 상세 속도).
 * 처음 단계 «대기»는 일을 건 때부터 실제로 돈 때까지 — main 줄 서기가 얼마나 막혔나.
 */
class StepClock(startedAtMs: Long, private val now: () -> Long) {
    private var last = startedAtMs
    private val start = startedAtMs
    private val parts = mutableListOf<Pair<String, Long>>()

    fun mark(step: String) {
        val t = now()
        parts += step to (t - last)
        last = t
    }

    fun line(): String =
        (parts.map { (s, ms) -> "$s ${ms}ms" } + "합 ${last - start}ms").joinToString(" · ")
}

/**
 * ⏱️ **화면 읽기 한 번의 시간을 1초마다 요약** — 이벤트마다 줄을 남기면 로그가 불어난다 (1f 조건).
 * 이벤트 수 · 같은 글자라 건너뛴 수 · 평균 · 최대 ms. 1초가 지나 다음 기록이 올 때 한 줄을 돌려준다.
 */
class ScanTimer(private val windowMs: Long = 1000) {
    companion object {
        fun typeWord(type: Int): String = when (type) {
            android.view.accessibility.AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED -> "내용"
            android.view.accessibility.AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED -> "창"
            android.view.accessibility.AccessibilityEvent.TYPE_VIEW_SCROLLED -> "스크롤"
            else -> "기타"
        }
    }
    private var windowStart = -1L
    private var count = 0
    private var same = 0
    private var total = 0L
    private var max = 0L
    private val sources = linkedMapOf<String, Int>()

    /** 알림 한 건의 출처(«앱/종류») — 다음 요약 줄에 개수로 싣는다 */
    fun countEvent(source: String) { sources[source] = (sources[source] ?: 0) + 1 }

    fun record(ms: Long, sameScreen: Boolean, nowMs: Long): String? {
        if (windowStart < 0) windowStart = nowMs
        count++
        if (sameScreen) same++
        total += ms
        if (ms > max) max = ms
        if (nowMs - windowStart < windowMs) return null
        val from = if (sources.isEmpty()) "" else " · 알림 " + sources.entries.sortedByDescending { it.value }.joinToString(" · ") { "${it.key} ${it.value}" }
        val line = "${nowMs - windowStart}ms 동안 ${count}번(같은 글자 ${same}) · 평균 ${total / count}ms · 최대 ${max}ms · 합 ${total}ms$from"
        windowStart = nowMs; count = 0; same = 0; total = 0; max = 0; sources.clear()
        return line
    }
}
