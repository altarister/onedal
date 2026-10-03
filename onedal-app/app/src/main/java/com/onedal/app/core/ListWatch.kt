package com.onedal.app.core

import com.onedal.app.models.ScreenContext

/**
 * 📜 **조용한 다시 읽기 — 언제 읽나** (`ListWatchTest`).
 * 픽커가 알림을 안 내면 서비스 캐시가 안 버려져 옛 틀(스크롤 전 · 움직이는 중간 틀 · 닫힌 시트)이 남는다 — 다시 읽어도 같은 옛 틀이 돌아온다.
 * 그래서 지켜보는 화면([watches])에서 [QUIET_MS] 넘게 읽기도 배차망 알림도 없으면 **캐시를 비우고** 한 번 읽는다(`HijackService.quietRead`).
 * - 지켜보는 화면: 목록 · 배차망 앱 안의 목록 밖 화면([OFF_LIST_WATCHED]) — 그 화면에서 목록으로 돌아와도 픽커가 알림을 안 내면 다음 목록 새로 고침까지 모른다
 * - 기사님이 목록을 만지는 중(스크롤·내용 알림)에는 마지막 알림 시각이 바뀌어 저절로 안 끼어든다
 * - 상세 · 팝업 · 운행 · 넘어가는 중 · 바탕화면 · 다른 앱 · 누름 대기 중에는 안 읽는다 — 알림으로만 읽는다
 * - 손이 닿은 직후 [TOUCH_WINDOW_MS] 는 [TOUCH_READ_MS] 간격(실측 5초 주기 부담 4.2% · 손 상세가 기억에 없던 콜) · 목록을 떠난 순간도 손이 닿은 것으로 센다
 * - 겹친 틀을 버렸으면 [AFTER_DISCARD_MS] 뒤 한 번 · [DISCARD_STREAK_MAX] 번 연달아 버리면 다시 [QUIET_MS] 주기로
 */
object ListWatch {
    const val QUIET_MS = 5_000L
    const val AFTER_DISCARD_MS = 500L
    const val DISCARD_STREAK_MAX = 3
    /** ✋ 손이 닿은 뒤(스크롤 알림 · 상세→목록 복귀 · 겹친 틀 버림) 이만큼은 [TOUCH_READ_MS] 간격 — 기사님은 카드를 보고 1~4초 안에 누르신다 */
    const val TOUCH_WINDOW_MS = 10_000L
    const val TOUCH_READ_MS = 1_500L
    /** 🧭 목록 밖이지만 지켜보는 화면 — 메뉴 · 홈 · 내 오더 · 모름(배차망 앱 안일 때만 · [watches]) */
    val OFF_LIST_WATCHED = setOf(ScreenContext.NETWORK_MENU, ScreenContext.HOME, ScreenContext.MY_ORDERS, ScreenContext.UNKNOWN)

    /** @param onNetworkPage 지금 화면이 배차망 앱 안인가 — 실물 배차망 앱이거나 배차망 정의 표의 페이지로 읽혔다(시뮬레이터 자기 화면은 아니다) */
    fun watches(screen: ScreenContext, onNetworkPage: Boolean): Boolean =
        screen == ScreenContext.LIST || (onNetworkPage && screen in OFF_LIST_WATCHED)

    /**
     * @param touchedAtMs 마지막으로 손이 닿은 때 — 그 뒤 [TOUCH_WINDOW_MS] 안이면 간격 [TOUCH_READ_MS] · 아니면 [QUIET_MS].
     *   알림 읽기가 간격 안에 돌았으면(마지막 읽기) 건너뛴다 — 두 번 읽지 않게
     */
    fun shouldRead(nowMs: Long, lastReadMs: Long, lastEventMs: Long, watched: Boolean, busy: Boolean,
                   touchedAtMs: Long = Long.MIN_VALUE / 2): Boolean {
        val gap = if (nowMs - touchedAtMs in 0..TOUCH_WINDOW_MS) TOUCH_READ_MS else QUIET_MS
        return watched && !busy && nowMs - lastReadMs >= gap && nowMs - lastEventMs >= gap
    }

    /** 로그 글 — 붙은 뒤 읽기도 알림도 없었으면(둘 다 0) 초가 아니라 «붙은 뒤 첫 읽기» */
    fun quietWord(nowMs: Long, lastReadMs: Long, lastEventMs: Long): String {
        val since = maxOf(lastReadMs, lastEventMs)
        return if (since <= 0L) "붙은 뒤 첫 읽기" else "알림 없이 ${(nowMs - since) / 1000}초"
    }

    /** 겹친 틀을 [streak] 번 연달아 버렸다 — 다시 읽을 때까지 기다릴 ms · null 이면 주기 읽기에 맡긴다 */
    fun afterDiscard(streak: Int): Long? = if (streak < DISCARD_STREAK_MAX) AFTER_DISCARD_MS else null
}
