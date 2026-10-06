package com.onedal.app.core

/** ⚖️ 블루투스로 온 결재를 어떻게 다루나 — 셋 다 «받았음»은 보낸다(`HijackService` onDecision) */
enum class DecisionStep {
    /** 이미 실행한 콜의 결재가 다시 옴(관제앱 · 서버 다시 보내기) — 실행하지 않는다 */
    REPLAY,
    /** 지금 열린 콜이 아님(지난 콜의 늦은 결재) — 버린다 */
    GHOST,
    /** 지금 콜의 처음 결재 — 실행한다 */
    EXECUTE,
}

object DecisionReplay {
    fun stepOf(orderId: String, lastExecuted: String?, currentOrderId: String): DecisionStep = when {
        orderId == lastExecuted -> DecisionStep.REPLAY
        orderId != currentOrderId -> DecisionStep.GHOST
        else -> DecisionStep.EXECUTE
    }
}
