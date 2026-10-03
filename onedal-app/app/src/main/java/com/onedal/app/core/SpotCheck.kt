package com.onedal.app.core

import com.onedal.app.core.engine.ScreenDetector

/**
 * 🔎 **자리 확인 — 목록 밖 지켜보는 화면은 알아본 글자 한 자리만 1초마다 본다** (`SpotCheckTest` · 기사님 «그 자리에 그 문자가 있는지만»).
 * 전체를 다시 읽는 대신 그 글자가 든 노드 하나를 `refresh()` 한다 — 없어졌거나 글자가 다르면 화면이 바뀐 것이라 그때만 전체 읽기.
 * - 고르는 글자는 지금 페이지(덮개)의 표 글자 — 픽커 메뉴는 리스트 위에 덮여 아래 «리스트 설정»이 트리에 남을 수 있다
 * - 표 글자로 안 맞은 페이지(모름 · 덧칸으로만 알아본 페이지)는 자리를 안 잡는다 — 지금처럼 전체 다시 읽기(`ListWatch`)
 * - 받침: 목록 밖 5초 전체 다시 읽기는 남는다 — `refresh()` 가 옛 정보를 줄 때
 */
object SpotCheck {
    /** 처음 몇 번은 한 줄씩 · 그 뒤 [SUMMARY_MS] 마다 요약 */
    const val FIRST_LOGS = 3
    const val SUMMARY_MS = 60_000L

    enum class Verdict { SAME, GONE }

    private val detector = ScreenDetector()

    /** 이 페이지를 알아본 갈래의 글자 중 화면에 있는 것 하나 — all 먼저, 그다음 any · 안 맞으면 없음 */
    fun wordOf(page: ScreenSpec, text: String): String? {
        val m = page.match.firstOrNull { detector.hits(listOf(it), text) } ?: return null
        return (m.all + m.any).firstOrNull { text.contains(it) }
    }

    /** 그 글자를 담은 첫 노드의 차례 */
    fun nodeIndexOf(nodeTexts: List<String>, word: String): Int? = nodeTexts.indexOfFirst { it.contains(word) }.takeIf { it >= 0 }

    /** 다시 본 자리 — 노드가 남아 있고(`refresh` 참) 글자가 아직 그 글자를 담으면 그대로 */
    fun verdict(refreshed: Boolean, textNow: String?, word: String): Verdict =
        if (refreshed && textNow?.contains(word) == true) Verdict.SAME else Verdict.GONE

    /** 🔎 잴 로그 — 처음 [FIRST_LOGS] 번은 한 줄씩 · 그 뒤 [SUMMARY_MS] 마다 횟수 · 평균 · 최대 */
    class Tally(private val label: String) {
        var checks = 0
            private set
        private var windowStartMs = -1L
        private var n = 0
        private var sumMs = 0L
        private var maxMs = 0L

        fun record(nowMs: Long, ms: Long): String? {
            checks++
            if (checks <= FIRST_LOGS) return "🔎 [자리 확인] $label · ${checks}번째 · ${ms}ms"
            if (windowStartMs < 0) windowStartMs = nowMs
            n++; sumMs += ms; maxMs = maxOf(maxMs, ms)
            if (nowMs - windowStartMs < SUMMARY_MS) return null
            val line = "🔎 [자리 확인] $label · ${n}번 · 평균 ${sumMs / n}ms · 최대 ${maxMs}ms"
            windowStartMs = nowMs; n = 0; sumMs = 0L; maxMs = 0L
            return line
        }
    }
}
