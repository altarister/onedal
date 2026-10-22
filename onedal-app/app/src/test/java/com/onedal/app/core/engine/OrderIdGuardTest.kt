package com.onedal.app.core.engine

import com.onedal.app.models.SimplifiedOfficeOrder
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * 🔢 **모든 콜은 번호가 있다** (기사님 «모든 콜에는 상차지 주소가 있는 것처럼 번호가 붙어야»).
 * 서버로 보내는 두 곳(/confirm · /detail)이 `SessionManager.withOrderId` 를 거친다 — 갈래마다 따로 막지 않는다.
 * 픽커 목록에는 번호가 없어 빈 번호가 그대로 가면 서버가 «unknown» 으로 바꾸고, 픽커 콜 둘이 같은 행을 덮었다.
 * 못 잡는 것: 보내는 두 곳이 실제로 이 함수를 부르는지(HijackService — 폰 · 서버 로그로 «unknown» 이 안 찍히나).
 */
class OrderIdGuardTest {

    private fun order(id: String) = SimplifiedOfficeOrder(id = id, pickup = "경기 성남시 수정구 신촌동", dropoff = "서울 광진구 자양2동", fare = 10830, timestamp = "t")

    @Test
    fun `빈 번호 콜은 번호가 생긴다 — 잡은 방식-시각 모양`() {
        val s = SessionManager()
        val sent = s.withOrderId(order(""))
        assertTrue(sent.id.matches(Regex("""(AUTO|MANUAL)-\d+""")))
    }

    @Test
    fun `한 콜 안에서는 두 번 불러도 같은 번호 — confirm 과 detail 이 같다`() {
        val s = SessionManager()
        val confirm = s.withOrderId(order(""))
        val detail = s.withOrderId(order(""))
        assertEquals(confirm.id, detail.id)
    }

    @Test
    fun `번호가 있는 콜은 그대로 — 인성 · 화물24시 목록 번호를 안 건드린다`() {
        val s = SessionManager()
        assertEquals("INSUNG-123", s.withOrderId(order("INSUNG-123")).id)
    }
}
