package com.onedal.app.core

import com.onedal.app.models.EmergencyReason
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** 🛑 **«눌렀나»를 보고한다** (`CancelReport` · D1 ④⑥) — 못 누르면 «안 눌렀음», 시간 끝 취소를 누른 뒤에만 «자동 취소 · 눌렀음» */
class CancelReportTest {
    @Test fun `못 눌렀으면 결재가 무엇이든 «버튼 못 찾음 · 안 눌렀음»`() {
        for (d in listOf("KEEP", "CANCEL")) for (t in listOf(true, false))
            assertEquals(CancelReport(EmergencyReason.BUTTON_NOT_FOUND, false), CancelReport.of(d, byTimeout = t, pressed = false))
    }

    @Test fun `시간 끝 취소를 실제로 눌렀을 때만 «자동 취소 · 눌렀음»`() {
        assertEquals(CancelReport(EmergencyReason.AUTO_CANCEL, true), CancelReport.of("CANCEL", byTimeout = true, pressed = true))
    }

    @Test fun `관제웹이 보낸 결재를 눌렀으면 보고하지 않는다 — 서버가 결재로 이미 안다`() {
        assertNull(CancelReport.of("CANCEL", byTimeout = false, pressed = true))
        assertNull(CancelReport.of("KEEP", byTimeout = false, pressed = true))
    }
}
