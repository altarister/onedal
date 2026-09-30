package com.onedal.app.plugins.hwamul24

import com.onedal.app.models.FilterConfig
import com.onedal.app.models.FilterTally
import com.onedal.app.models.SimplifiedOfficeOrder
import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * 🗳️ **화물24시도 떨어진 까닭을 콜에 싣는다 — 누름과 같은 분기** (reviews/23 E1).
 * 막은 내일 콜이 장부에 «예약 때문에 막음»으로 남는다. 축 차례는 인성과 같다:
 * 예약 → 차종 → 지역 → 요금 → 상차 목록 → 상차 → 블랙 → 경로 순서. 성적표도 같은 까닭으로 센다.
 */
class Hwamul24VerdictTest {
    /** 도착지 키워드가 비면 24시는 «보류»(지역 탈락)다 — 지금 코드 그대로. 도착 동 하나를 준다 */
    private val on = FilterConfig(isActive = true, minFare = 30000, pickupRadiusKm = 10.0, destinationKeywords = listOf("장상동"))
    private fun call(fare: Int = 50000, vehicle: String? = "2.5톤/윙", km: Double? = 5.0, reservedDay: Int? = null) =
        SimplifiedOfficeOrder(id = "c", pickup = "경기 시흥 정왕동", dropoff = "경기 안산 상록구 장상동", fare = fare,
            timestamp = "t", vehicleType = vehicle, pickupDistance = km,
            reserved = if (reservedDay != null) true else null, reservedDay = reservedDay)

    private fun axis(o: SimplifiedOfficeOrder, f: FilterConfig = on, t: FilterTally? = null) = Hwamul24Parser.judge(o, f, t)

    @Test fun `통과는 pass`() = assertEquals(Hwamul24Parser.Verdict(true, "pass"), axis(call()))

    @Test fun `잠긴 필터는 locked 이고 성적표에 안 센다`() {
        val t = FilterTally()
        assertEquals(Hwamul24Parser.Verdict(false, "locked"), axis(call(), on.copy(isActive = false), t))
        assertEquals(0, t.seen)
    }

    @Test fun `내상 콜은 예약 축 - 성적표에도 예약`() {
        val t = FilterTally()
        assertEquals(Hwamul24Parser.Verdict(false, "reservation"), axis(call(reservedDay = 1, fare = 1000), on, t))
        assertEquals(1, t.reservation)
        assertEquals(1, t.seen)
    }

    @Test fun `차종 · 요금 · 상차 차례`() {
        assertEquals("vehicle", axis(call(fare = 1000), on.copy(allowedVehicleTypes = listOf("1톤"))).axis)
        assertEquals("fare", axis(call(fare = 1000, km = 50.0)).axis)
        assertEquals("pickup", axis(call(km = 50.0)).axis)
    }
}
