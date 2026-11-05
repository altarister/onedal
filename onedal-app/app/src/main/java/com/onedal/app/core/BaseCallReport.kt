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
     * @param seenText 이 보고가 읽은 화면 글자 — 첫 보고는 누른 콜의 목록 줄, 상세 보고는 상세 글. 기록에는 이 한 줄만 간다
     * @param screen 그 글자가 나온 화면
     * @param read 읽은 방법 — 글자(text) · 사진(photo)
     */
    fun partOf(orderId: String, at: String, seenText: String?, screen: String = "newList", read: String = "text", fill: () -> BaseCall?): Part = try {
        val call = fill()?.copy(id = orderId)   // 번호는 보내기 직전에 정해진다
        val evidence = seenText?.takeIf { it.isNotBlank() }?.let { CallEvidence(seen = listOf(EvidenceLine(at = at, screen = screen, read = read, rawText = it))) }
        if (call != null && LogOnce.changed("baseCall-part", "${call.id}/$screen")) {
            val gson = com.google.gson.Gson()
            AppLogger.d("BaseCallReport", LogTag.CALL_STAGE, "🎯 [기본 콜] ${call.targetApp} ${call.id.take(8)} $screen — 요금 줄 ${call.money.lines.size} · 상세 주소 ${!call.route.pickup.addressDetail.isNullOrEmpty()} · 목록 동 ${call.route.listRegion != null} · 기본 콜 ${gson.toJson(call).toByteArray().size}바이트 · 기록 ${evidence?.let { gson.toJson(it).toByteArray().size } ?: 0}바이트")
        }
        if (call == null) Part()
        else Part(call, evidence)
    } catch (e: Throwable) {   // TODO() · 재귀 넘침 · 초기화 실패는 Exception 이 아니다
        if (LogOnce.changed("baseCall-failed", e.javaClass.name)) AppLogger.w("BaseCallReport", "🎯 [기본 콜 조립 실패] 옛 보고만 보낸다 — ${e.message}")
        Part()
    }
}
