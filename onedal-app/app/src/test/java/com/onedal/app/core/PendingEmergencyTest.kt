package com.onedal.app.core

import com.onedal.app.models.EmergencyReason
import com.onedal.app.models.EmergencyReport
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * 📮 **못 보낸 «자동 취소» 보고를 들고 있다가 보낸다** (40 S2-3 · 23 · 기사님 답 3 «저장 칸 하나»).
 * 원달앱 인터넷이 끊긴 채 안전취소가 «취소»를 누르면 보고가 두 번 실패하고 버려졌다 — 서버는 그 콜을 «잡은 콜»로 계속 들고 있었다.
 * 못 잡는 것: 보고가 닿을 때(`onReplied`) 다시 보내는 배선 · 원달앱이 다시 떠서 보내기(폰 시험).
 */
class PendingEmergencyTest {
    private fun report(id: String, reason: EmergencyReason = EmergencyReason.AUTO_CANCEL, pressed: Boolean? = true) =
        EmergencyReport(deviceId = "d", orderId = id, reason = reason.value, screenContext = "LIST", screenText = "", timestamp = "t", cancelPressed = pressed)

    @Test fun `못 닿은 «자동 취소 · 눌렀음»만 담는다`() {
        assertTrue(PendingEmergency.holds(report("a"), delivered = false))
        assertFalse("닿았으면 안 담음", PendingEmergency.holds(report("a"), delivered = true))
        assertFalse("다른 까닭은 지금처럼", PendingEmergency.holds(report("a", EmergencyReason.BUTTON_NOT_FOUND), delivered = false))
        assertFalse("못 눌렀으면(계약 남음) 다른 길", PendingEmergency.holds(report("a", pressed = false), delivered = false))
    }

    @Test fun `같은 콜은 한 줄 · 지우면 빈다 · 글로 적었다 되살려도 같다`() {
        val two = PendingEmergency.merge(PendingEmergency.merge(emptyList(), report("a")), report("a"))
        assertEquals(1, two.size)
        val both = PendingEmergency.merge(two, report("b"))
        assertEquals(listOf("a", "b"), both.map { it.orderId })
        assertEquals(listOf("b"), PendingEmergency.remove(both, "a").map { it.orderId })
        assertEquals(both, PendingEmergency.fromJson(PendingEmergency.toJson(both)))
    }

    @Test fun `깨진 글 · 빈 칸은 빈 목록`() {
        assertEquals(emptyList<EmergencyReport>(), PendingEmergency.fromJson(null))
        assertEquals(emptyList<EmergencyReport>(), PendingEmergency.fromJson("{깨짐"))
    }
}
