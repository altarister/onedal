package com.onedal.app.core.engine

import com.onedal.app.models.SimplifiedOfficeOrder
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * 📋 **모자란 요건을 이름으로** — «요건 미달»만으로는 요금인지 주소인지 몰라 원인을 사진부터 다시 캐야 했다 (실물 09-30 13:14).
 * 세 배차망 공통 한 줄 — `meetsDetail` 은 이 목록이 비었는가다.
 */
class OrderRequirementNamesTest {
    private fun o(p: String, d: String, fare: Int) = SimplifiedOfficeOrder(id = "c", pickup = p, dropoff = d, fare = fare, timestamp = "t")

    @Test fun `요금 · 상차 · 하차를 이름으로`() {
        assertEquals(listOf("요금 없음"), OrderRequirement.missingDetail(o("경기 이천시 중리동 올영", "경기 이천시 증포동", 0)))
        assertEquals(listOf("상차 주소 짧음(이천 중리)", "하차 주소 짧음()"), OrderRequirement.missingDetail(o("이천 중리", "", 3364)))
    }

    @Test fun `모두 있으면 빈 목록이고 meetsDetail 은 참`() {
        val ok = o("경기 이천시 중리동 올영 이천터미널점", "경기 이천시 증포동", 3364)
        assertTrue(OrderRequirement.missingDetail(ok).isEmpty())
        assertTrue(OrderRequirement.meetsDetail(ok))
    }
}
