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

    /** 판정만 흐름에서 앱이 누른 지 시간 창(`ALARM_OPEN_WINDOW_MS`) 밖에 열린 상세는 손 상세로 본다 */
    fun releaseToHand(openedByApp: Boolean, contractedByApp: Boolean, opener: String): Boolean =
        openedByApp && !contractedByApp && opener == com.onedal.app.plugins.kakaopicker.KakaoPickerKeywords.OPENER_HAND

    /** 열린 상세가 앱이 누른 줄과 다를 때 */
    fun onMismatch(contractedByApp: Boolean): OnMismatch = if (contractedByApp) OnMismatch.RETREAT else OnMismatch.KEEP_AS_HAND

    /**
     * 누르기가 안 먹혔다(화면 그대로) — 그 누르기가 세운 «앱이 연 콜»을 되돌리나.
     * 화면이 목록 그대로라 «목록으로 돌아왔다» 리셋이 안 온다 — 여기서 메우지 않으면 뒤에 기사님이 연 상세를 그 줄과 대조한다(라이브 09-30 22:56→23:01).
     */
    fun releaseOnTapFailed(openedByApp: Boolean, failedKey: String, tappedKey: String?, onList: Boolean): Boolean =
        openedByApp && onList && tappedKey != null && failedKey == tappedKey
}
