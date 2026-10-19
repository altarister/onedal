package com.onedal.app.core

import com.onedal.app.core.engine.SafeCancelTimer
import com.onedal.app.core.engine.SessionManager

/**
 * 🛡️ **결재 · 시간 끝 집행 — 무엇을 할지는 이 값 함수가 정한다** (38 F36 · 24 리뷰 · `DecisionRunTest`).
 * 집행은 타이머를 끄며 시작한다. 그런데 타이머를 끄면 «지킨 계약»(콜 · 배차망 · 패키지)이 지워진다 —
 * 그래서 끄기 전에 떠 둔 값([Target]) 하나를 받아 그 뒤 모든 단계(돌아감 · 누름 · 보고)가 그 값만 읽는다.
 */
object DecisionRun {
    /** 떠 둔 지킨 계약 — 바뀌지 않는 값 */
    data class Target(val orderId: String, val network: String?, val pkg: String?)

    enum class Step { RETURN, PRESS, NOT_PRESSED, NOTHING_TO_PRESS }

    /** 이 결재가 타이머가 지키는 콜의 것이면 그 계약 — 아니면 null(부수 효과 없음) */
    fun peek(timer: SafeCancelTimer, orderId: String?): Target? =
        timer.armedOrderId?.takeIf { orderId != null && it == orderId }?.let { Target(it, timer.armedNetwork, timer.armedPackage) }

    /** 🔴 집행 시작 — 지킨 계약을 떠 둔 **뒤에** 타이머를 끈다(끈 뒤에는 배차망이 지워진다) */
    fun begin(timer: SafeCancelTimer, orderId: String?, session: SessionManager): Target? {
        val target = peek(timer, orderId)
        timer.cancel(session)
        return target
    }

    /**
     * 다음 할 일 — 지금 화면이 그 배차망이 아니면 돌아감(5초 안) · 넘으면 못 누름 · 그 배차망 단추가 없으면
     * KEEP 은 누를 것 없음(수락 뒤 누를 결재 단추가 없는 배차망) · CANCEL 은 못 누름.
     */
    fun next(target: Target?, screenNet: String?, word: String?, decision: String, elapsedMs: Long): Step =
        when (ReturnStep.of(screenNet, target?.network, elapsedMs)) {
            ReturnStep.Step.RETURN_FIRST -> Step.RETURN
            ReturnStep.Step.GIVE_UP -> Step.NOT_PRESSED
            ReturnStep.Step.PRESS -> when {
                word != null -> Step.PRESS
                decision == "KEEP" -> Step.NOTHING_TO_PRESS
                else -> Step.NOT_PRESSED
            }
        }

    /** 결재 집행이 끝날 때까지는 바쁨 — 지키는 계약이 있거나 «결재 버튼» 기다림이 살아 있다(돌아가는 5초 동안 새 계약을 열지 않게) */
    fun busy(armedOrderId: String?, pendingNames: Collection<String>): Boolean =
        armedOrderId != null || BUTTON_WAIT in pendingNames

    /** 결재 버튼 기다림의 이름 — 다시 걸면 같은 이름이 앞 것을 끈다(`WaitBook.schedule`) */
    const val BUTTON_WAIT = "결재 버튼"
}
