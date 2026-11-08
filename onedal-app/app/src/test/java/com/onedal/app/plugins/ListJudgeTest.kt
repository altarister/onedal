package com.onedal.app.plugins

import com.onedal.app.core.LogOnce
import com.onedal.app.models.FilterConfig
import com.onedal.app.models.SimplifiedOfficeOrder
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import com.onedal.app.models.CallStop
import com.onedal.app.core.firstPickupStop
import com.onedal.app.core.lastDropoffStop
import com.onedal.app.core.StopText
import com.onedal.app.core.withLastDropoff

/**
 * 🧪 **목록 줄 판정 공통 함수 — 배차망 몫 넷(`Rules`)이 실제로 쓰이나**.
 * 축 차례 · 성적표는 화물24시 판정 검사(`Hwamul24VerdictTest`)가 본다 — 여기서는 인자만.
 */
class ListJudgeTest {
    private val on = FilterConfig(isActive = true, minFare = 30000, pickupRadiusKm = 10.0, destinationKeywords = listOf("장상동"))
    private fun call(pickup: String = "경기 시흥 정왕동", raw: String? = null, vehicle: String? = "트럭") =
        SimplifiedOfficeOrder(
            id = "c",
            fare = 50000, money = com.onedal.app.models.CallMoney.ofIncome(50000),
            timestamp = "t",
            vehicleType = vehicle,
            rawText = raw,
            pickupDetails = listOf(CallStop(listText = pickup, distanceKm = 5.0)),
            dropoffDetails = listOf(CallStop(listText = "경기 안산 상록구 장상동")),
)
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

    /** 💰 단가에 쓰는 차종은 `Rules.rateVehicleOf` 가 고른다 — 콜 화면 차종이 오토바이여도 기사님 차종(1t)을 넘기면 1t 단가로 선다 */
    @Test fun `단가 차종 인자가 화면 차종 대신 쓰인다`() {
        // 20km · 16,000원 → km 당 800원 — 오토바이 700 은 넘고 1t 1000 은 못 넘는다
        val o = withLastDropoff(call(vehicle = "오토").copy(fare = 16000, money = com.onedal.app.models.CallMoney.ofIncome(16000))) { it.copy(distanceKm = 20.0) }
        val f = on.copy(minFare = 6000, ratePerKm = mapOf("오토바이" to 700, "1t" to 1000), driverVehicleType = "1t")
        assertEquals("pass", ListJudge.judge(o, f, null, rules()).axis)                                   // 인자 없음 = 화면 차종(오토 → 오토바이 700)
        assertEquals("fare", ListJudge.judge(o, f, null, rules().copy(rateVehicleOf = { _, cfg -> cfg.driverVehicleType })).axis)
        // 고른 차종이 null 이면 단가 조건만 빠지고 최소 금액은 남는다
        assertEquals("pass", ListJudge.judge(o, f, null, rules().copy(rateVehicleOf = { _, _ -> null })).axis)
        assertEquals("fare", ListJudge.judge(o, f.copy(minFare = 20000), null, rules().copy(rateVehicleOf = { _, _ -> null })).axis)
    }

    @Test fun `판정 로그 열쇠에 배차망 코드가 붙어 다른 배차망의 같은 콜 로그를 지우지 않는다`() {
        val o = call(pickup = "경기 시흥 열쇠시험동")
        ListJudge.judge(o, on, null, rules(net = "netA"))
        val key = "${StopText.of(firstPickupStop(o))}|${StopText.of(lastDropoffStop(o))}|${o.fare}"
        val seen = "truetruetruetruetruetruetrue"
        assertFalse(LogOnce.changed("target:netA|$key", seen))
        assertTrue(LogOnce.changed("target:netB|$key", seen))
    }
}
