package com.onedal.app.core

/**
 * 📜 **조용한 목록 다시 읽기 — 언제 읽나** (`ListWatchTest` · onedal-1f «가»).
 * 픽커가 알림을 안 내면 서비스 캐시가 안 버려져 옛 틀(스크롤 전 · 움직이는 중간 틀)이 남는다 — 다시 읽어도 같은 옛 틀이 돌아온다.
 * 그래서 목록에서 [QUIET_MS] 넘게 읽기도 배차망 알림도 없으면 **캐시를 비우고** 한 번 읽는다(`HijackService.quietRead`).
 * - 기사님이 목록을 만지는 중(스크롤·내용 알림)에는 마지막 알림 시각이 바뀌어 저절로 안 끼어든다
 * - 상세·다른 화면 · 누름 대기 중에는 안 읽는다
 * - 겹친 틀을 버렸으면 [AFTER_DISCARD_MS] 뒤 한 번 · [DISCARD_STREAK_MAX] 번 연달아 버리면 다시 [QUIET_MS] 주기로
 */
object ListWatch {
    const val QUIET_MS = 5_000L
    const val AFTER_DISCARD_MS = 500L
    const val DISCARD_STREAK_MAX = 3

    fun shouldRead(nowMs: Long, lastReadMs: Long, lastEventMs: Long, isListScreen: Boolean, busy: Boolean): Boolean =
        isListScreen && !busy && nowMs - lastReadMs >= QUIET_MS && nowMs - lastEventMs >= QUIET_MS

    /** 겹친 틀을 [streak] 번 연달아 버렸다 — 다시 읽을 때까지 기다릴 ms · null 이면 주기 읽기에 맡긴다 */
    fun afterDiscard(streak: Int): Long? = if (streak < DISCARD_STREAK_MAX) AFTER_DISCARD_MS else null
}
