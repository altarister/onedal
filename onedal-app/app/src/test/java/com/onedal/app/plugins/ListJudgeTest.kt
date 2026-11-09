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
    /** 서버가 빈 1t 차에 보내는 허용 차종 다섯 — 빈 목록은 «꽉 참»이다 */
    private val on = FilterConfig(allowedVehicleTypes = listOf("오토바이", "승용차", "다마스", "라보", "1t"), isActive = true, minFare = 30000, pickupRadiusKm = 10.0, destinationKeywords = listOf("장상동"))
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

    /** 📦 서버가 보낸 빈 허용 차종은 «꽉 참» — 차종 축에서 모두 떨어진다 */
    @Test fun `빈 허용 차종은 꽉 참이라 차종 축에서 떨어진다`() {
        val full = on.copy(allowedVehicleTypes = emptyList())
        assertEquals("vehicle", ListJudge.judge(call(), full, null, rules(vehicleOf = { "오토바이" })).axis)
    }

    @Test fun `차종은 배차망 차종 표로 맞춘 뒤 허용 목록과 같은지 본다`() {
        val f = on.copy(allowedVehicleTypes = listOf("1t"))
        assertEquals("pass", ListJudge.judge(call(), f, null, rules(vehicleOf = { "1t" })).axis)
        assertEquals("vehicle", ListJudge.judge(call(), f, null, rules(vehicleOf = { null })).axis)
    }

    /** 💰 단가는 콜 짐 묶음 차종을 차종 맞춤 한 규칙으로 찾는다 — 기사님 차종(1t)이 와도 «오토» 콜은 오토바이 단가 · 모르는 차종 글자면 단가 조건만 빠진다 */
    @Test fun `단가는 콜 차종으로 - 기사님 차종을 안 본다`() {
        // 20km · 16,000원 → km 당 800원 — 오토바이 700 은 넘고 1t 1000 은 못 넘는다
        val o = withLastDropoff(call(vehicle = "오토").copy(fare = 16000, money = com.onedal.app.models.CallMoney.ofIncome(16000))) { it.copy(distanceKm = 20.0) }
        val f = on.copy(minFare = 6000, ratePerKm = mapOf("오토바이" to 700, "1t" to 1000), driverVehicleType = "1t")
        assertEquals("pass", ListJudge.judge(o, f, null, rules()).axis)
        assertEquals("fare", ListJudge.judge(withLastDropoff(call(vehicle = "1t").copy(fare = 16000, money = com.onedal.app.models.CallMoney.ofIncome(16000))) { it.copy(distanceKm = 20.0) }, f, null, rules()).axis)
        // 차종 글자를 모르면(«트럭») 단가 조건만 빠지고 최소 금액은 남는다
        val unknown = withLastDropoff(call(vehicle = "트럭").copy(fare = 16000, money = com.onedal.app.models.CallMoney.ofIncome(16000))) { it.copy(distanceKm = 20.0) }
        assertEquals("pass", ListJudge.judge(unknown, f, null, rules()).axis)
        assertEquals("fare", ListJudge.judge(unknown, f.copy(minFare = 20000), null, rules()).axis)
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
