package com.onedal.app.core

/**
 * 🔕 **같은 말을 되풀이하지 않는다** — 열쇠(콜 지문 · 화면 등)마다 마지막으로 찍은 글자를 기억해, 글자가 바뀔 때만 «찍어라»를 준다.
 * 화면 읽기는 1초마다 돌아 같은 콜 · 같은 판정이 스캔마다 되풀이됐다(이천 한 바퀴 7분에 1,581줄 · reviews/22).
 * 최근 `MAX` 개만 기억한다 — 오래된 열쇠는 잊어 다시 한 번 찍힌다(콜이 목록에서 사라졌다 돌아온 것과 같다).
 */
object LogOnce {
    const val MAX = 300

    private val last = object : LinkedHashMap<String, String>(64, 0.75f, true) {
        override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, String>?): Boolean = size > MAX
    }

    /** 이 열쇠의 글자가 지난번과 다르면 true(찍는다) — 같으면 false */
    @Synchronized
    fun changed(key: String, text: String): Boolean {
        if (last[key] == text) return false
        last[key] = text
        return true
    }
}
