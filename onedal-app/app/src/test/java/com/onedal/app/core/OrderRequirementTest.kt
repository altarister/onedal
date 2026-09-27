package com.onedal.app.core

import com.onedal.app.core.engine.OrderRequirement
import com.onedal.app.models.SimplifiedOfficeOrder
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * 📋 **콜 요건 — 모든 배차망이 같은 한 줄** (기사님 «요건은 공통»)
 * 상차 · 하차 · 요금이 채워져야 서버가 판단할 수 있다. 서버도 같은 셋을 «판정 불가»로 본다(detail.ts).
 * 배차망마다 다른 것은 «하차가 없어도 되는 콜 종류»(픽커 도보) 하나뿐이다.
 */
class OrderRequirementTest {

    private fun order(pickup: String, dropoff: String, fare: Int) =
        SimplifiedOfficeOrder(id = "t", type = "MANUAL_CLICK", pickup = pickup, dropoff = dropoff, fare = fare, timestamp = "")

    @Test
    fun `상차·하차·요금이 다 있으면 요건을 갖췄다`() {
        assertTrue(OrderRequirement.meets(order("광주 경안", "광주 탄벌", 4000), allowsEmptyDropoff = false))
    }

    @Test
    fun `하나라도 비면 요건을 못 갖췄다`() {
        assertFalse(OrderRequirement.meets(order("", "광주 탄벌", 4000), allowsEmptyDropoff = false))
        assertFalse(OrderRequirement.meets(order("광주 경안", "", 4000), allowsEmptyDropoff = false))
        assertFalse(OrderRequirement.meets(order("광주 경안", "광주 탄벌", 0), allowsEmptyDropoff = false))
    }

    @Test
    fun `«배차값없음»은 빈 값이다`() {
        assertFalse(OrderRequirement.meets(order("배차값없음", "광주 탄벌", 4000), allowsEmptyDropoff = false))
        assertFalse(OrderRequirement.meets(order("광주 경안", "배차값없음", 4000), allowsEmptyDropoff = false))
    }

    @Test
    fun `하차가 없어도 되는 콜 종류는 하차를 보지 않는다 - 상차·요금은 본다`() {
        assertTrue(OrderRequirement.meets(order("올영 용인역북점", "", 2979), allowsEmptyDropoff = true))
        assertFalse(OrderRequirement.meets(order("", "", 2979), allowsEmptyDropoff = true))
    }
}
