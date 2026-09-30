package com.onedal.app.core

/**
 * ⏱️ **읽기 한 번을 구간으로 나눈다** — «읽기 나눔» 계측 (기사님 «팝업 여는 속도가 너무 느려졌어» · onedal-1f · `ReadSpeedTest`).
 * 읽기가 시작될 때 [start], 구간이 끝날 때마다 [mark] — 앞 표시부터의 ms 를 그 이름에 더한다(같은 이름은 합친다).
 */
class ReadSplit {
    private var lastMs = 0L
    private val parts = LinkedHashMap<String, Long>()

    fun start(nowMs: Long) { parts.clear(); lastMs = nowMs }

    fun mark(name: String, nowMs: Long) {
        parts[name] = (parts[name] ?: 0L) + (nowMs - lastMs)
        lastMs = nowMs
    }

    fun line(): String = parts.entries.joinToString(" · ") { "${it.key} ${it.value}" }
}
