package com.onedal.app.core

import com.onedal.app.models.EmergencyReason
import com.onedal.app.models.EmergencyReport

/**
 * 📮 **못 보낸 «자동 취소» 보고 — 들고 있다가 보고가 닿으면 보낸다** (40 S2-3 · 23 · 기사님 답 3 «저장 칸 하나»).
 * 원달앱 인터넷이 끊긴 채 안전취소가 «취소»를 누르면 보고가 재시도까지 실패하고 버려졌다 — 서버는 그 콜을 «잡은 콜»로 계속 들고 있었다.
 * 담는 것은 «자동 취소 · 눌렀음»뿐(기사님 말) — 다른 비상 까닭은 지금처럼. 같은 콜은 한 줄 · 닿으면 지운다(서버는 다시 온 보고를 그대로 둔다 · c4cf89e1).
 * 값만 받는 함수 — 저장 칸(`Prefs.PENDING_AUTO_CANCEL`) 읽고 쓰기와 다시 보내기는 부르는 쪽(`HijackService`)이 한다.
 */
object PendingEmergency {
    private val gson = com.google.gson.Gson()
    private val listType = object : com.google.gson.reflect.TypeToken<List<EmergencyReport>>() {}.type

    /** 이 보고를 들고 있을까 — 못 닿은 «자동 취소 · 눌렀음»만 */
    fun holds(report: EmergencyReport, delivered: Boolean): Boolean =
        !delivered && report.reason == EmergencyReason.AUTO_CANCEL.value && report.cancelPressed == true

    /** 같은 콜은 한 줄(뒤에 온 것으로) */
    fun merge(saved: List<EmergencyReport>, report: EmergencyReport): List<EmergencyReport> =
        saved.filter { it.orderId != report.orderId } + report

    fun remove(saved: List<EmergencyReport>, orderId: String): List<EmergencyReport> = saved.filter { it.orderId != orderId }

    fun toJson(saved: List<EmergencyReport>): String = gson.toJson(saved)

    /** 비었거나 깨진 글은 빈 목록 — 저장 칸 하나가 깨져도 원달앱이 멈추지 않는다 */
    fun fromJson(raw: String?): List<EmergencyReport> =
        if (raw.isNullOrBlank()) emptyList() else runCatching { gson.fromJson<List<EmergencyReport>>(raw, listType) ?: emptyList() }.getOrDefault(emptyList())
}
