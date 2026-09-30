package com.onedal.app.core

/**
 * 📜 **스크롤 알림을 모아 목록을 한 번 읽는 때** (실물 09-30 14:16~14:18 · `ScrollGateTest`).
 *
 * 픽커 목록은 스크롤만으로는 «내용 바뀜» 알림을 안 낸다 — 앱이 목록 글자가 바뀌는 다음 분까지 화면을 안 읽어,
 * 기사님이 목록을 맨 위로 올리고도 1분 늦게 콜을 열었다. 스크롤 알림은 한 번 밀 때 수십 개가 쏟아지고
 * 화면 한 번 읽기는 46~280ms 라 알림마다 읽지 않는다.
 * - 마지막 스크롤 [QUIET_MS] 뒤에 한 번
 * - 스크롤이 계속 이어져도 첫 스크롤부터 [MAX_WAIT_MS] 안에는 읽는다(천천히 계속 내리면 영영 안 읽는 일이 없게)
 * 돌려주는 값은 읽을 시각(부팅 기준) — 부르는 쪽이 걸어 둔 읽기를 이 시각으로 바꿔 건다.
 */
class ScrollGate(private val quietMs: Long = QUIET_MS, private val maxWaitMs: Long = MAX_WAIT_MS) {
    companion object {
        const val QUIET_MS = 300L
        const val MAX_WAIT_MS = 1000L
    }

    private var firstScrollAtMs: Long = -1
    private var lastScrollAtMs: Long = Long.MIN_VALUE / 2

    fun onScroll(nowMs: Long): Long {
        lastScrollAtMs = nowMs
        if (firstScrollAtMs < 0) firstScrollAtMs = nowMs
        return minOf(nowMs + quietMs, firstScrollAtMs + maxWaitMs)
    }

    /**
     * 📜 **마지막 스크롤이 [quietMs] 안인가** — 그동안 온 «내용 바뀜»은 이 문이 곧 한 번 읽는다(`EventRoute`).
     * 스크롤 중 내용 알림이 초당 수십 개라 따로 읽으면 초당 3~4번 · 메인 스레드 0.6~1초였다(실물 09-30 18:29).
     */
    fun scrolledRecently(nowMs: Long): Boolean = nowMs - lastScrollAtMs < quietMs

    /** 읽었다 — 다음 스크롤부터 새로 모은다 */
    fun onScanned() { firstScrollAtMs = -1 }
}
