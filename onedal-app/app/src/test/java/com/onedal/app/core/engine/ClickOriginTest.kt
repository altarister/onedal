package com.onedal.app.core.engine

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * 🔴 **콜의 출신은 스위치가 아니라 «누가 눌렀나» 다** (규칙 ③)
 *
 * 출신(`type` 앞머리 · 콜 id 접두사)은 `SessionManager.clickOrigin` **한 곳**에서만 파생한다 —
 * `session.isAutoActive`(누가 눌렀나)로 정하고, 기기 모드 스위치(`telemetryManager.currentMode`)는 쓰지 않는다.
 *
 * 스위치로 정하면 두 곳이 깨진다:
 *   · **자동 스위치인 채 손으로 확정**한 콜에 `"AUTO_CLICK"` 이 찍힌다.
 *     서버는 `type.startsWith("MANUAL")` 로 직접콜을 보호하므로(`devices.ts`),
 *     **리스트로 돌아오는 순간 서버가 그 콜을 강제 취소**한다 —
 *     *"콜의 주인은 기사님이다"*(규칙 ①)가 깨지는 자리다.
 *   · 알람 모드에서는 `"ALARM_CLICK"` 이라는 **서버가 모르는 딱지**가 생긴다.
 *     알람은 *"내가 직접 누른다"* 가 약속인데 잡는 족족 취소된다.
 */
class ClickOriginTest {

    @Test
    fun `매크로가 눌렀으면 AUTO 다`() {
        val s = SessionManager()
        s.isAutoActive = true
        assertEquals("AUTO", s.clickOrigin)
    }

    @Test
    fun `매크로가 안 눌렀으면 MANUAL 이다 — 직접콜`() {
        val s = SessionManager()
        s.isAutoActive = false
        assertEquals("MANUAL", s.clickOrigin)
    }

    /**
     * 🔴 **모드 이름이 출신에 새어 나오면 안 된다.** 값이 늘 때마다
     *    서버가 모르는 딱지가 생긴다 (알람 모드면 `"ALARM_CLICK"`).
     */
    @Test
    fun `출신은 두 값뿐이다 — 기기 모드 이름이 섞이지 않는다`() {
        val s = SessionManager()
        for (auto in listOf(true, false)) {
            s.isAutoActive = auto
            assertTrue(
                "출신은 AUTO·MANUAL 뿐이어야 한다 (실제: ${s.clickOrigin})",
                s.clickOrigin == "AUTO" || s.clickOrigin == "MANUAL"
            )
        }
    }

    /**
     * 🔴 콜 id 접두사도 같은 원천(`clickOrigin`)을 쓴다. 기기 모드로 만들면
     *    알람 모드에서 `"ALARM-1234…"` 처럼 서버가 모르는 id 가 생긴다.
     */
    @Test
    fun `콜 id 접두사도 출신을 따른다`() {
        val s = SessionManager()
        s.isAutoActive = false
        s.ensureOrderId()
        assertTrue("id 가 MANUAL- 로 시작해야 한다 (실제: ${s.currentOrderId})",
            s.currentOrderId.startsWith("MANUAL-"))
    }

    @Test
    fun `이미 id 가 있으면 덮어쓰지 않는다`() {
        val s = SessionManager()
        s.setOrderId("인성-9999")
        s.isAutoActive = true
        s.ensureOrderId()
        assertEquals("인성-9999", s.currentOrderId)
    }
}
