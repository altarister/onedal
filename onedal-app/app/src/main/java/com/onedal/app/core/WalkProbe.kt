package com.onedal.app.core

/**
 * 🧪 **나무 훑기 계측 — 미리 받기(prefetch) 번갈아 재기 · 캐시 낡음 확인** (`WalkProbeTest` · 실물 09-30 18:45 · onedal-1f «가»).
 *
 * 같은 목록 한 번 훑기가 11ms ~ 930ms 로 80배 벌어졌다 — 서비스 쪽 노드 캐시가 살아 있으면 통신이 없고, 앱의 «내용 바뀜»
 * 알림으로 버려진 뒤에는 노드마다 통신이다. 두 가지를 잰다(재기만 한다 · 읽는 노드와 판정은 같다):
 * - 목록 읽기마다 기본 / 미리 받기(DEPTH_FIRST · 한 번에 최대 50개)를 번갈아 · SDK 33 미만은 늘 기본
 * - 픽커가 알림을 안 내면 캐시가 안 버려져 옛 나무를 돌려줄 수 있다(16:18 · 18:45 스크롤 뒤) — 알림 없이 5초 넘은 목록 읽기에서
 *   30초에 한 번까지만 캐시를 비우고 다시 읽어 글자가 달라지는지 본다. 누름이 걸려 있으면 하지 않는다(다음 읽기가 비싸진다)
 */
object WalkProbe {
    enum class Way(val word: String) { PLAIN("기본"), PREFETCH("미리 받기") }

    const val PREFETCH_MIN_SDK = 33
    const val QUIET_MS = 5_000L
    const val CACHE_PROBE_EVERY_MS = 30_000L

    fun wayFor(sdk: Int, readNo: Long): Way =
        if (sdk < PREFETCH_MIN_SDK || readNo % 2L != 0L) Way.PLAIN else Way.PREFETCH

    fun shouldProbeCache(sdk: Int, nowMs: Long, lastEventMs: Long, lastProbeMs: Long, isListScreen: Boolean, busy: Boolean): Boolean =
        sdk >= PREFETCH_MIN_SDK && isListScreen && !busy &&
            lastEventMs > 0 &&   // 붙은 뒤 알림을 한 번도 못 봤으면 조용한지 모른다
            nowMs - lastEventMs >= QUIET_MS && nowMs - lastProbeMs >= CACHE_PROBE_EVERY_MS

    /** 비운 뒤에 새로 보인 줄 — 앞 [max] 개 (세곡 같은 줄이 새로 나타나면 캐시가 낡았던 것) */
    fun newLines(before: List<String>, after: List<String>, max: Int = 3): List<String> {
        val had = before.toHashSet()
        return after.filter { it !in had }.distinct().take(max)
    }
}
