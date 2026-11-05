package com.onedal.app.core

import com.onedal.app.models.BaseCall
import com.onedal.app.models.CallEvidence
import com.onedal.app.models.EvidenceLine

/**
 * 🎯 **보고에 실을 기본 콜 조각을 만든다** (계획서 C1).
 * 값은 플러그인이 채우고 합치기는 서버(`mergeBaseCall`) 한 곳에서 한다 — 앱은 보고마다 찾은 값만 보낸다.
 * 🔴 조립이 터져도 옛 보고는 나가야 한다. 보고가 안 나가면 픽커 알람이 빈다.
 */
object BaseCallReport {
    data class Part(val baseCall: BaseCall? = null, val evidence: CallEvidence? = null)

    /**
     * @param listRowText 누른 콜의 목록 줄 글자 — 첫 보고에만 싣는다. 기록에는 이 한 줄만 간다
     */
    fun partOf(orderId: String, at: String, listRowText: String?, fill: () -> BaseCall?): Part = try {
        val call = fill()?.copy(id = orderId)   // 번호는 보내기 직전에 정해진다
        if (call == null) Part()
        else Part(call, listRowText?.takeIf { it.isNotBlank() }?.let { CallEvidence(seen = listOf(EvidenceLine(at = at, screen = "newList", read = "text", rawText = it))) })
    } catch (e: Throwable) {   // TODO() · 재귀 넘침 · 초기화 실패는 Exception 이 아니다
        if (LogOnce.changed("baseCall-failed", e.javaClass.name)) AppLogger.w("BaseCallReport", "🎯 [기본 콜 조립 실패] 옛 보고만 보낸다 — ${e.message}")
        Part()
    }
}
