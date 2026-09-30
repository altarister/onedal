package com.onedal.app.core

/**
 * ♻️ **마지막 원문과 그 결과를 기억한다** — 같은 원문이면 다시 풀지 않는다(`LastParseTest`).
 * 원문 자체로 가른다(같은 객체면 바로, 아니면 글자 비교) — 버전 글자로 가르면 값이 같아도 다시 풀거나, 값이 바뀌어도 못 알아챈다.
 * 메인 스레드(접근성 읽기) 한 곳에서만 부른다 — 잠금이 없다.
 */
class LastParse<T>(private val parse: (String) -> T) {
    private var lastRaw: String? = null
    private var lastValue: T? = null
    /** 🧪 실제로 푼 횟수 — 검사가 센다 */
    internal var parses = 0
        private set

    @Suppress("UNCHECKED_CAST")
    fun of(raw: String): T {
        val prev = lastRaw
        if (prev != null && (prev === raw || prev == raw)) return lastValue as T
        val v = parse(raw)
        parses++
        lastRaw = raw
        lastValue = v
        return v
    }
}
