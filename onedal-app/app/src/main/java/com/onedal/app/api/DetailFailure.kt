package com.onedal.app.api

import java.util.concurrent.Executor

/**
 * 🧵 **상세 보고 실패 알림 — 받은 실행기로 넘긴다** (`DetailFailureTest` · 29 X5 · P1-04).
 * 실패 콜백(서비스의 `executeDecisionImmediately`)은 화면 스레드 전용 상태(`WaitBook` · 세션)를 만진다 — 보내는 스레드에서 곧바로 부르지 않는다.
 */
object DetailFailure {
    fun notify(onThread: Executor, orderId: String, onDecisionReceived: (String, String) -> Unit) =
        onThread.execute { onDecisionReceived(orderId, "CANCEL") }
}
