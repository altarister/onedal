package com.onedal.app.core

/**
 * ⚡ **접근성 끼어들기(`onInterrupt`)가 몇 번 오나 — 운영센터 «이상 기록»에 «INTERRUPT: N번»으로 남긴다**.
 *
 * 끼어들기는 «접근성 꺼짐»이 아닌데 지금 원달앱은 그때 보고 · 안전취소를 멈춘다(`HijackService.onInterrupt`). 그것을 바꿀지는
 * 실제로 얼마나 자주 오는지를 본 뒤 정한다 — 그래서 먼저 센다. 동작은 바꾸지 않는다.
 * 한 시간에 한 번만 올리고, 그 사이 온 수를 함께 싣는다(몇 번인지가 재려는 값이다). 보내는 손(`sink`)은 `HijackService` 가 단다.
 */
object InterruptReport {
    /** (지난 기록 뒤 끼어들기 수) */
    @Volatile var sink: ((Int) -> Unit)? = null

    private const val EVERY_MS = 60 * 60_000L
    private var lastSentAt = 0L
    private var pending = 0

    /** 끼어들기 하나 — 올렸으면 true */
    @Synchronized
    fun record(nowMs: Long = System.currentTimeMillis()): Boolean {
        pending++
        if (lastSentAt != 0L && nowMs - lastSentAt < EVERY_MS) return false
        sink?.invoke(pending)
        lastSentAt = nowMs
        pending = 0
        return true
    }
}
