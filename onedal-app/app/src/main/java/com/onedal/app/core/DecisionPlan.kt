package com.onedal.app.core

/**
 * 🗳️ **결재 하나를 받았을 때 원달앱이 무엇을 하나 — 판단만** (집행은 `HijackService.executeDecisionImmediately`).
 * 검사: `DecisionPlanTest` — 실제 버튼 누르기 · 뒤로 가기는 폰 시험 몫.
 */
enum class DecisionPlan {
    /** 모르는 결재 값 — 아무것도 안 한다(안전취소 타이머도 그대로 · 규칙 ④) */
    IGNORE_UNKNOWN,
    /** 체험 — 실제 버튼을 누르지 않고 뒤로 */
    SIMULATED_BACK,
    /** 앱이 열었지만 계약하지 않은 콜에 CANCEL — 바로 목록으로 */
    BACK_TO_LIST,
    /** 계약하지 않은 콜 — 버튼을 누르지 않고 머문다(기사님이 보고 누르신다) */
    STAY,
    /** 앱이 계약한 콜에 KEEP — «닫기» */
    PRESS_CLOSE,
    /** 앱이 계약한 콜에 CANCEL — «취소»(곧 계약 취소) */
    PRESS_CANCEL;

    /** 안전취소 타이머를 끄나 — 아는 결재면 무엇이든(KEEP · CANCEL · 체험 모두 그 콜의 끝이다) */
    val stopsSafeCancel: Boolean get() = this != IGNORE_UNKNOWN

    companion object {
        /** 서버 · 관제앱이 보내는 결재 값(shared `SupplyDecisionAction`) */
        val KNOWN = setOf("KEEP", "CANCEL", "SIMULATED_KEEP", "SIMULATED_CANCEL")

        /**
         * @param modeBlocksAccept 지금 도는 모드가 확정을 막나(`ModeActs.blocksAccept` — 체험)
         */
        fun of(decision: String, modeBlocksAccept: Boolean, contractedByApp: Boolean, openedByApp: Boolean): DecisionPlan = when {
            decision !in KNOWN -> IGNORE_UNKNOWN
            decision.startsWith("SIMULATED_") || modeBlocksAccept -> SIMULATED_BACK
            !contractedByApp -> if (openedByApp && decision == "CANCEL") BACK_TO_LIST else STAY
            decision == "KEEP" -> PRESS_CLOSE
            else -> PRESS_CANCEL
        }
    }
}
