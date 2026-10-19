package com.onedal.app.core

/**
 * 🛡️ **잡은 뒤 결재로 누를 글자 — 그 배차망 낱말 한 곳** (38 F36 · F38 · `DecisionWordTest`).
 * 없으면(null) — KEEP 은 «누를 것 없음 = 집행 끝»(화물24시는 신청하면 «배차신청 뒤 화물상세정보»에 머문다 — 누를 결재 단추가 없다) ·
 * CANCEL 은 «못 누름»(계약이 남음 · 서버에 «취소 못 누름»).
 */
object DecisionWord {
    fun of(plan: DecisionPlan, keywords: ScreenKeywords): String? = when (plan) {
        DecisionPlan.PRESS_CLOSE -> keywords.contractCloseButton
        DecisionPlan.PRESS_CANCEL -> keywords.contractCancelButton
        else -> null
    }
}
