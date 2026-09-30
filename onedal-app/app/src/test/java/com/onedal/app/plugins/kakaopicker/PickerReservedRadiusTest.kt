package com.onedal.app.plugins.kakaopicker

import com.onedal.app.models.SimplifiedOfficeOrder
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * 📅 **내일 이후 예약 콜은 줄이지 않은 기본 상차 반경으로 거른다** (기사님 «가» · onedal-1f).
 * 자동 반경은 지금 자리에서 줄인 값이라 내일 콜에는 맞지 않다 — 내일은 그 자리에서 출발하지 않는다.
 * 라이브 09-30 21:33:58 — 반경 16.87km 로 내일 콜 셋(신촌 20.0 · 서초 16.9 · 와부 19.4)이 상차에서 떨어졌다. 서버가 reservedPickupRadiusKm 를 싣는다.
 */
class PickerReservedRadiusTest {
    private fun call(fare: Int, km: Double, day: Int?, reserved: Boolean = day != null) =
        SimplifiedOfficeOrder(id = "c$fare", pickup = "광주 경안", dropoff = "서대문 신촌", fare = fare, timestamp = "t",
            pickupDistance = km, reserved = reserved, reservedDay = day)
    private fun pickupOk(o: SimplifiedOfficeOrder, reserved: Double?) =
        KakaoPickerParser.decideAxes(o, 6000, 16.8735745562319, reservationMode = "tomorrowToo", reservedPickupRadiusKm = reserved).pickup

    @Test fun `21시33분 내일 콜 셋은 내일 콜 반경 25 로 상차 통과`() {
        assertTrue(pickupOk(call(14168, 20.0, 1), 25.0))
        assertTrue(pickupOk(call(10500, 16.9, 1), 25.0))
        assertTrue(pickupOk(call(8960, 19.4, 1), 25.0))
    }

    @Test fun `오늘 콜 16점9km 는 16점87 로 탈락 그대로`() {
        assertFalse(pickupOk(call(10500, 16.9, null), 25.0))
        assertFalse(pickupOk(call(10500, 16.9, 0), 25.0))
    }

    @Test fun `칸이 없으면 옛 반경`() = assertFalse(pickupOk(call(14168, 20.0, 1), null))

    @Test fun `날 모르는 예약은 기본 반경`() = assertFalse(pickupOk(call(14168, 20.0, null, reserved = true), 25.0))

    @Test fun `까닭 글에 어느 반경으로 걸렀나`() {
        assertEquals("상차 20.0km > 내일 콜 반경 16.87km", KakaoPickerParser.pickupMissWord(call(14168, 20.0, 1), 16.8735745562319, null))
        assertEquals("상차 26.0km > 내일 콜 반경 25km", KakaoPickerParser.pickupMissWord(call(14168, 26.0, 1), 16.87, 25.0))
        assertEquals("상차 16.9km > 오늘 콜 반경 16.87km", KakaoPickerParser.pickupMissWord(call(10500, 16.9, null), 16.8735745562319, 25.0))
    }
}
