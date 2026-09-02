package com.onedal.app.core

import com.onedal.app.core.engine.SessionManager.CollectState

/**
 * 🚦 **앱이 지금 무슨 일을 하는 중인가 — 다섯 칸** (기사님 확정 2026-09-02 ·
 * `docs/기획/폰_상태바.md` 0단계 ①)
 *
 * 관제웹은 여태 `isHolding` **불리언 하나**만 받았다. «콜을 처리 중»까지만 알고
 * **어디서 멈췄는지**는 몰랐다 — 팝업 2장째에서 막힌 것과 판결을 기다리는 것이
 * 화면에서 똑같이 보였다. 앱 안에는 그 답이 이미 다 있었는데 **안 보냈을 뿐**이다.
 *
 * 🔴 **판정은 여기 하나다.** 앱이 «칸과 숫자»만 보내고 **이름은 관제웹이 짓는다** —
 *    한글 낱말을 앱과 웹 두 곳에 두면 한쪽만 고쳐진다 (규칙 ③).
 */
object WorkStage {
    const val IDLE = "IDLE"
    const val DETAIL = "DETAIL"
    const val POPUP = "POPUP"
    const val AWAITING_VERDICT = "AWAITING_VERDICT"
    const val SAFE_CANCEL = "SAFE_CANCEL"

    /**
     * @param step    팝업이 몇 장째인가 (POPUP 일 때만)
     * @param seconds 안전취소가 몇 초 남았나 (SAFE_CANCEL 일 때만)
     *
     * ⚠️ 숫자 둘을 한 칸으로 합치지 않는다 — «몇 장째»와 «몇 초»는 **다른 질문**이다.
     */
    data class Stage(val stage: String, val step: Int? = null, val seconds: Int? = null)

    /**
     * 🔴 **좁은 것부터 본다.** 안전취소가 도는 동안은 판결도 기다리는 중이지만,
     *    기사님께 쓸모 있는 것은 **남은 초**다 — 그 안에 무르지 않으면 계약이다.
     */
    fun of(
        isAutoActive: Boolean,
        isWaitingForDecision: Boolean,
        safeCancelRemainSec: Int?,
        collectState: CollectState,
        isDetailScrapSent: Boolean,
    ): Stage = when {
        safeCancelRemainSec != null -> Stage(SAFE_CANCEL, seconds = safeCancelRemainSec)
        isWaitingForDecision -> Stage(AWAITING_VERDICT)
        collectState == CollectState.WAITING_FOR_PICKUP_POPUP -> Stage(POPUP, step = 1)
        collectState == CollectState.WAITING_FOR_DROPOFF_POPUP -> Stage(POPUP, step = 2)
        collectState == CollectState.WAITING_FOR_MEMO_POPUP -> Stage(POPUP, step = 3)
        isDetailScrapSent || isAutoActive -> Stage(DETAIL)
        else -> Stage(IDLE)
    }
}
