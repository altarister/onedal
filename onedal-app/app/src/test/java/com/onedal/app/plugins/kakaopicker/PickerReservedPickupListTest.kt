package com.onedal.app.plugins.kakaopicker

import com.onedal.app.models.SimplifiedOfficeOrder
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * 📅 **내일 이후 예약 콜의 상차는 «집 둘레 기본 반경 안의 동 목록»으로 거른다** (기사님 «내일콜 가» · onedal-1f · onedal-ab 칸 reservedPickupKeywords).
 * 목록 줄의 «N km»는 지금 폰 위치 기준이라 내일 콜에는 맞지 않다 — 내일은 집에서 출발한다.
 * 라이브 09-30 21:33:58 내일 콜 셋: 송파 문정2 20.0km · 분당 삼평 16.9km · 하남 천현 19.4km (자동 반경 16.87 에 모두 떨어졌다).
 * 상차 동을 못 읽은 줄은 모름 = 통과(서버 판정이 집 기준으로 다시 본다). 칸이 없으면 지금 길(reservedPickupRadiusKm + 목록 km).
 */
class PickerReservedPickupListTest {
    private fun call(pickup: String, km: Double, day: Int?) = SimplifiedOfficeOrder(id = "c", pickup = pickup, dropoff = "서대문 신촌", fare = 10000,
        timestamp = "t", pickupDistance = km, reserved = day != null, reservedDay = day)
    private fun pickupOk(o: SimplifiedOfficeOrder, list: List<String>?, reservedRadius: Double? = null) =
        KakaoPickerParser.decideAxes(o, 6000, 16.87, reservationMode = "tomorrowToo", reservedPickupRadiusKm = reservedRadius, reservedPickupKeywords = list).pickup

    private val home = listOf("문정2동", "삼평동", "천현동")

    @Test fun `21시33분 내일 콜 셋 - 집 목록에 들면 km 와 상관없이 통과`() {
        assertTrue(pickupOk(call("송파 문정2", 20.0, 1), home))
        assertTrue(pickupOk(call("분당 삼평", 16.9, 1), home))
        assertTrue(pickupOk(call("하남 천현", 19.4, 1), home))
    }

    @Test fun `집 목록 밖이면 탈락`() = assertFalse(pickupOk(call("하남 천현", 3.0, 1), listOf("문정2동", "삼평동")))

    @Test fun `상차 동을 못 읽은 줄은 통과`() = assertTrue(pickupOk(call("", 30.0, 1), home))

    @Test fun `오늘 콜은 지금처럼 반경`() = assertFalse(pickupOk(call("분당 삼평", 16.9, null), home))

    @Test fun `목록 칸이 없으면 지금 길`() {
        assertTrue(pickupOk(call("송파 문정2", 20.0, 1), null, reservedRadius = 25.0))
        assertFalse(pickupOk(call("송파 문정2", 20.0, 1), null, reservedRadius = null))
    }

    @Test fun `까닭 글 - 집 둘레 목록 밖`() =
        assertEquals("상차 하남 천현 > 내일 콜 집 둘레 목록 밖", KakaoPickerParser.pickupMissWord(call("하남 천현", 3.0, 1), 16.87, null, listOf("문정2동")))
}
