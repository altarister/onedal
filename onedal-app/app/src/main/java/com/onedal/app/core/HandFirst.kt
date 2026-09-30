package com.onedal.app.core

/**
 * ✋ **기사님 손이 먼저** (기사님 «시스템과 기사의 input 이 같이 들어가면 뭐가 우선?» · `HandFirstTest`).
 *
 * 손이 움직인 뒤 [QUIET_MS] 동안 앱은 누르기만 미룬다(소리는 곧바로 · 기사님 «가»). 멈추면 곧바로 다시 읽어 그 화면에서 고른다 — 담아 두지 않는다.
 * 손을 가르는 사실(부르는 쪽): 배차망 스크롤 알림(앱은 스크롤하지 않는다) · 앱이 안 쏜 상세 열림 · 앱의 뒤로 가기 없는 상세→목록 ·
 * 앱 터치 뒤 [OWN_TAP_ECHO_MS] 밖의 누름 알림(인성·24 — 픽커는 목록 줄 누름에 알림을 안 낸다).
 * 1.5초: 기사님 «3초가 너무 긴 것 같은데.. 소리가 나면 내가 손을 떼라는 거지?» — 소리를 듣고 손을 떼는 시간.
 * (처음 3초의 근거 · 폰 로그 09-30 어림: 상세→목록 복귀 뒤 다음 손 동작 54번 — 3초 안 17 · 5초 안 28 · 중앙 4.5초)
 */
class HandFirst(private val quietMs: Long = QUIET_MS) {
    companion object {
        const val QUIET_MS = 1_500L
        /** 앱이 쏜 터치가 누름 알림으로 되돌아오는 시간 — 이 안의 누름 알림은 손이 아니다 */
        const val OWN_TAP_ECHO_MS = 700L
        /** 앱이 뒤로 가기를 보낸 뒤 목록이 뜨기까지 — 이 안의 상세→목록은 손이 아니다 (실측 0.7~0.9초 · 손 먼저 3초와 뜻이 다르다) */
        const val APP_BACK_ECHO_MS = 2_000L
        /** 앱 누름 뒤 이 안의 손 흔적을 센다 — 잠금 창을 정하는 재료 */
        const val AFTER_APP_TAP_MS = 1_000L

        /** 앱이 누른 뒤 [AFTER_APP_TAP_MS] 안이면 그 ms, 아니면 null */
        fun afterAppTapMs(nowMs: Long, lastAppTapAtMs: Long): Long? =
            (nowMs - lastAppTapAtMs).takeIf { lastAppTapAtMs > 0L && it in 0L..AFTER_APP_TAP_MS }

        fun isClickHand(clickAtMs: Long, lastAppTapAtMs: Long): Boolean =
            lastAppTapAtMs <= 0L || clickAtMs - lastAppTapAtMs !in 0L..OWN_TAP_ECHO_MS
    }

    var lastHandAtMs = 0L
        private set
    private var heldSinceMs = 0L

    fun onHand(nowMs: Long) { lastHandAtMs = nowMs }

    fun blocks(nowMs: Long): Boolean = lastHandAtMs > 0L && nowMs - lastHandAtMs < quietMs

    fun quietAtMs(): Long = lastHandAtMs + quietMs

    /** 손 때문에 미뤘다 — 처음 미룬 때만 적는다 */
    fun hold(nowMs: Long) { if (heldSinceMs == 0L) heldSinceMs = nowMs }

    /** 미뤘던 뒤 처음 고를 때 — 손 때문에 늦어진 ms (없으면 null · 한 번만) */
    fun releasedMs(nowMs: Long): Long? {
        val since = heldSinceMs.takeIf { it > 0L } ?: return null
        heldSinceMs = 0L
        return nowMs - since
    }
}
