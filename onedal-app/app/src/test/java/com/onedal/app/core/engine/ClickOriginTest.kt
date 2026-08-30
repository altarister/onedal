package com.onedal.app.core.engine

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * 🔴 **콜의 출신은 스위치가 아니라 «누가 눌렀나» 다** (용어집 §9 · 규칙 ③)
 *
 * 이 검사가 잡는 실사고 (2026-08-30 코드리뷰에서 발견):
 *
 * `type` 을 정하는 판단이 **두 벌**이었다 —
 *   · `handleDetailScreen` 갈래 : `session.isAutoActive` (누가 눌렀나) ✅
 *   · `buildOrderFromScreen`    : `telemetryManager.currentMode` (스위치) ❌
 *
 * 그래서 **자동 스위치인 채 손으로 확정**하면 `"AUTO_CLICK"` 이 찍혔다.
 * 서버는 `type.startsWith("MANUAL")` 로 직접콜을 보호하는데(`devices.ts`),
 * 그 딱지가 안 붙으니 **리스트로 돌아오는 순간 서버가 그 콜을 강제 취소**한다 —
 * *"콜의 주인은 기사님이다"*(규칙 ①)가 깨지는 자리다.
 *
 * 🔴 기기 모드가 셋이 되면서(자동·알람·대기) 이 결함이 커졌다 —
 *    알람 모드에서는 `"ALARM_CLICK"` 이라는 **서버가 모르는 딱지**가 태어난다.
 *    알람은 *"내가 직접 누른다"* 가 약속인데 잡는 족족 취소되는 것이다.
 *
 * → 출신은 `SessionManager.clickOrigin` **한 곳**에서만 파생한다.
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
     *    서버가 모르는 딱지가 태어난다 (`"ALARM_CLICK"` 이 그렇게 났다).
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
     * 🔴 콜 id 접두사도 같은 원천을 쓴다. 예전엔 `ensureOrderId(currentMode)` 라
     *    알람 모드에서 `"ALARM-1234…"` 라는 id 가 만들어졌다.
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
