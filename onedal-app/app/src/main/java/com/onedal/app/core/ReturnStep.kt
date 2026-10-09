package com.onedal.app.core

/**
 * ↩️ **결재 · 시간 끝에 누르기 전 — 지금 화면이 그 콜의 배차망인가** (38 F36 · `ReturnStepTest`).
 * 다른 배차망 화면의 글자를 누르지 않는다 — 먼저 그 배차망으로 돌아가고, [LIMIT_MS] 안에 못 돌아가면 누르지 않는다(«취소 못 누름» · 계약이 남음).
 * 지킨 배차망을 모르면(옛 저장 값 · 타이머가 안 지키는 결재) 지금처럼 이 화면에서 누른다.
 */
object ReturnStep {
    enum class Step { PRESS, RETURN_FIRST, GIVE_UP }

    const val LIMIT_MS = 5_000L

    fun of(screenNet: String?, armedNet: String?, elapsedMs: Long, limitMs: Long = LIMIT_MS): Step = when {
        armedNet == null || screenNet == armedNet -> Step.PRESS
        elapsedMs >= limitMs -> Step.GIVE_UP
        else -> Step.RETURN_FIRST
    }
}
