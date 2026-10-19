package com.onedal.app.core

/**
 * 🛡️ **잡은 뒤 결재로 누를 글자 — 그 배차망 확정 기준 페이지의 단추(`buttons`) 한 곳** (38 F36 · F38 · `DecisionWordTest`).
 * 배차망은 지키는 계약의 배차망 · 없으면 지금 배차망 — 다른 배차망 화면에 가 있다가 돌아가 누를 때 그 배차망 글자를 찾지 않게.
 * 없으면(null) — KEEP 은 «누를 것 없음 = 집행 끝»(화물24시는 신청하면 «배차신청 뒤 화물상세정보»에 머문다 — 누를 결재 단추가 없다) ·
 * CANCEL 은 «못 누름»(계약이 남음 · 서버에 «취소 못 누름»).
 */
object DecisionWord {
    fun of(plan: DecisionPlan, contractNet: String?, currentNet: String): String? {
        val buttons = buttonsOn(com.onedal.app.plugins.DispatchPluginRegistry.get(contractNet ?: currentNet).screens, "confirm")
        return when (plan) {
            DecisionPlan.PRESS_CLOSE -> buttons?.keep
            DecisionPlan.PRESS_CANCEL -> buttons?.cancel
            else -> null
        }
    }
}
