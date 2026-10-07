package com.onedal.app.core

import com.onedal.app.models.EmergencyReason

/**
 * 🛑 **결재 버튼을 누르러 간 결과 — 서버에 무엇을 보고하나** (null 이면 보고 없음).
 *    못 눌렀으면 계약이 남아 있다(«안 눌렀음» — 서버는 취소로 세지 않고 콜을 그대로 둔다) ·
 *    안전취소 시간 끝의 취소를 **실제로 눌렀을 때만** «자동 취소 · 눌렀음». 서버는 «눌렀나» 하나로 가른다(`routes/emergency.ts`).
 */
data class CancelReport(val reason: EmergencyReason, val cancelPressed: Boolean) {
    companion object {
        /** @param byTimeout 안전취소 시간 끝으로 누르러 간 취소인가 · @param pressed 버튼을 찾아 눌렀나(화면을 못 얻었으면 false) */
        fun of(decision: String, byTimeout: Boolean, pressed: Boolean): CancelReport? = when {
            !pressed -> CancelReport(EmergencyReason.BUTTON_NOT_FOUND, cancelPressed = false)
            decision == "CANCEL" && byTimeout -> CancelReport(EmergencyReason.AUTO_CANCEL, cancelPressed = true)
            else -> null
        }
    }
}
