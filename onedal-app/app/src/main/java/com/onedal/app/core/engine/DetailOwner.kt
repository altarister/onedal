package com.onedal.app.core.engine

/**
 * 👆 **이 상세는 누가 열었나 — 가르는 곳 한 벌** (기사님 «지금 내가 눌러서 열었는데 그냥 닫았어» · `DetailOwnerTest`).
 *
 * 가르는 사실은 배차망 이름이 아니라 **«이 상세에서 앱이 계약 버튼을 누를 예정인가»**(`contractedByApp`)다.
 * - 누를 예정이면(자동 잡기) — 엉뚱한 콜을 잡지 않게 지금처럼 물러난다. 계약은 절대 안 누른다.
 * - 누를 예정이 아니면(알람 · 판정만) — 기사님 손과 부딪히지 않게 닫지 않고 손 상세 길로 판정만 보낸다.
 */
object DetailOwner {
    enum class OnMismatch { RETREAT, KEEP_AS_HAND }

    /**
     * 🔎 **앱이 누른 지 이 시간 안에 열린 상세는 앱이 연 것** — 배차망 무관한 공통 사실(`DetailOpenerTest`).
     * 앱이 목록 줄을 누른 뒤 상세가 뜨기까지 실측 0.3~0.4초 — 넉넉히 5초. `[상세 대기]` 줄의 «연 쪽»과 손 상세 가르기가 쓴다.
     */
    const val ALARM_OPEN_WINDOW_MS = 5_000L

    /** 앱(알람)이 찍어 연 상세 */
    const val OPENER_ALARM = "알람"
    /** 기사님이 손으로 연 상세 */
    const val OPENER_HAND = "손"

    fun detailOpener(alarmTapAtMs: Long, nowMs: Long): String =
        if (alarmTapAtMs > 0L && nowMs - alarmTapAtMs in 0L..ALARM_OPEN_WINDOW_MS) OPENER_ALARM else OPENER_HAND

    /** 판정만 흐름에서 앱이 누른 지 시간 창(`ALARM_OPEN_WINDOW_MS`) 밖에 열린 상세는 손 상세로 본다 */
    fun releaseToHand(openedByApp: Boolean, contractedByApp: Boolean, opener: String): Boolean =
        openedByApp && !contractedByApp && opener == OPENER_HAND

    /**
     * 👆 **연 쪽은 한 번 정한다** — 정해 둔 값이 있으면 그것, 없으면 지금 창으로 잰다(`OpenerLatchTest`).
     * 채우기(인성 팝업 3장)·사진 판독 뒤에 다시 재면 느린 날 앱이 연 상세가 창 밖으로 나가 손 상세가 됐다.
     */
    fun openerAt(settled: String?, tapAtMs: Long, nowMs: Long): String =
        settled ?: detailOpener(tapAtMs, nowMs)

    /** 열린 상세가 앱이 누른 줄과 다를 때 */
    fun onMismatch(contractedByApp: Boolean): OnMismatch = if (contractedByApp) OnMismatch.RETREAT else OnMismatch.KEEP_AS_HAND

    /**
     * 누르기가 안 먹혔다(화면 그대로) — 그 누르기가 세운 «앱이 연 콜»을 되돌리나.
     * 화면이 목록 그대로라 «목록으로 돌아왔다» 리셋이 안 온다 — 여기서 메우지 않으면 뒤에 기사님이 연 상세를 그 줄과 대조한다(라이브 09-30 22:56→23:01).
     */
    fun releaseOnTapFailed(openedByApp: Boolean, failedKey: String, tappedKey: String?, onList: Boolean): Boolean =
        openedByApp && onList && tappedKey != null && failedKey == tappedKey
}
