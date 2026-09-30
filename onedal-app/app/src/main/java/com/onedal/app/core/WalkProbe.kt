package com.onedal.app.core

/**
 * 🧪 **나무 훑기 계측 — 미리 받기(prefetch) 번갈아 재기 · 캐시 낡음 확인** (`WalkProbeTest` · 실물 09-30 18:45 · onedal-1f «가»).
 *
 * 같은 목록 한 번 훑기가 11ms ~ 930ms 로 80배 벌어졌다 — 서비스 쪽 노드 캐시가 살아 있으면 통신이 없고, 앱의 «내용 바뀜»
 * 알림으로 버려진 뒤에는 노드마다 통신이다. 두 가지를 잰다(재기만 한다 · 읽는 노드와 판정은 같다):
 * - 목록 읽기마다 기본 / 미리 받기(DEPTH_FIRST · 한 번에 최대 50개)를 번갈아 · SDK 33 미만은 늘 기본
 * - 알림 없을 때 캐시를 비우고 다시 읽기는 `ListWatch`(조용한 목록 다시 읽기)가 맡는다 · [newLines] 는 그 로그가 쓴다
 */
object WalkProbe {
    enum class Way(val word: String) { PLAIN("기본"), PREFETCH("미리 받기") }

    const val PREFETCH_MIN_SDK = 33

    fun wayFor(sdk: Int, readNo: Long): Way =
        if (sdk < PREFETCH_MIN_SDK || readNo % 2L != 0L) Way.PLAIN else Way.PREFETCH

    /** 비운 뒤에 새로 보인 줄 — 앞 [max] 개 (세곡 같은 줄이 새로 나타나면 캐시가 낡았던 것) */
    fun newLines(before: List<String>, after: List<String>, max: Int = 3): List<String> {
        val had = before.toHashSet()
        return after.filter { it !in had }.distinct().take(max)
    }
}
