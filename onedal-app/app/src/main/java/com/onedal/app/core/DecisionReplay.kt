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
    /** @param armedOrderId 안전취소 타이머가 지키는 콜 — 목록 복귀로 세션 번호가 비어도 그 콜의 결재는 집행한다(D1 ①) */
    fun stepOf(orderId: String, lastExecuted: String?, currentOrderId: String, armedOrderId: String? = null): DecisionStep = when {
        orderId == lastExecuted -> DecisionStep.REPLAY
        orderId != currentOrderId && orderId != armedOrderId -> DecisionStep.GHOST
        else -> DecisionStep.EXECUTE
    }
}
