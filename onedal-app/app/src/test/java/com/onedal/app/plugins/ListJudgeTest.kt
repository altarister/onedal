package com.onedal.app.plugins

import com.onedal.app.core.LogOnce
import com.onedal.app.models.FilterConfig
import com.onedal.app.models.SimplifiedOfficeOrder
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * 🧪 **목록 줄 판정 공통 함수 — 배차망 몫 넷(`Rules`)이 실제로 쓰이나**.
 * 축 차례 · 성적표는 화물24시 판정 검사(`Hwamul24VerdictTest`)가 본다 — 여기서는 인자만.
 */
class ListJudgeTest {
    private val on = FilterConfig(isActive = true, minFare = 30000, pickupRadiusKm = 10.0, destinationKeywords = listOf("장상동"))
    private fun call(pickup: String = "경기 시흥 정왕동", raw: String? = null, vehicle: String? = "트럭") =
        SimplifiedOfficeOrder(id = "c", pickup = pickup, dropoff = "경기 안산 상록구 장상동", fare = 50000,
            timestamp = "t", vehicleType = vehicle, pickupDistance = 5.0, rawText = raw)
    private fun rules(net: String = "a", vehicleOf: (String?) -> String? = { "1t" }, text: (SimplifiedOfficeOrder) -> String = { it.rawText ?: "" }) =
        ListJudge.Rules(vehicleOf = vehicleOf, blacklistTextOf = text, logHead = "시험", netCode = net)

    @Test fun `제외어는 배차망이 고른 글에서만 찾는다`() {
        val o = call(raw = "적요 수작업 꼬리")
        val f = on.copy(excludedKeywords = listOf("수작업"))
        assertEquals("blacklist", ListJudge.judge(o, f, null, rules()).axis)
        assertEquals("pass", ListJudge.judge(o, f, null, rules(text = { "적요 꼬리" })).axis)
    }

    @Test fun `차종은 배차망 차종 표로 맞춘 뒤 허용 목록과 같은지 본다`() {
        val f = on.copy(allowedVehicleTypes = listOf("1t"))
        assertEquals("pass", ListJudge.judge(call(), f, null, rules(vehicleOf = { "1t" })).axis)
        assertEquals("vehicle", ListJudge.judge(call(), f, null, rules(vehicleOf = { null })).axis)
    }

    @Test fun `판정 로그 열쇠에 배차망 코드가 붙어 다른 배차망의 같은 콜 로그를 지우지 않는다`() {
        val o = call(pickup = "경기 시흥 열쇠시험동")
        ListJudge.judge(o, on, null, rules(net = "netA"))
        val key = "${o.pickup}|${o.dropoff}|${o.fare}"
        val seen = "truetruetruetruetruetruetrue"
        assertFalse(LogOnce.changed("target:netA|$key", seen))
        assertTrue(LogOnce.changed("target:netB|$key", seen))
    }
}
