package com.onedal.app.plugins.hwamul24

import android.content.ContextWrapper
import com.onedal.app.models.FilterConfig
import com.onedal.app.models.SimplifiedOfficeOrder
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Test
import com.onedal.app.core.VehicleWordMiss
import java.time.LocalDate

/**
 * 🚚 **화물24시 차종 낱말 → 우리 차종 — 배차망 정의 표(vehicleWords) 한 곳** (기사님 «기준은 배차망 · 플러그인으로 맞춘다»)
 *
 * 차종 줄은 «낱말/…» 꼴이고 첫 «/» 앞 낱말이 배차망의 차종이다(«1톤/전체» · «다마스/전체마대»).
 * 그 낱말을 표로 우리 차종(1t · 다마스 …)에 맞춘 뒤 허용 차종과 **같은지**로 본다 — «담고 있나»로 보면 «11톤»이 1t 에 걸린다.
 */
class Hwamul24VehicleWordsTest {
    private val parser = Hwamul24Parser(ContextWrapper(null))
    private val small = FilterConfig(isActive = true, minFare = 30000, pickupRadiusKm = 10.0, destinationKeywords = listOf("장상동"),
        allowedVehicleTypes = listOf("오토바이", "다마스", "라보", "승용차"))
    private fun call(vehicle: String?) = SimplifiedOfficeOrder(id = "c", pickup = "경기 시흥 정왕동", dropoff = "경기 안산 상록구 장상동",
        fare = 50000, timestamp = "t", vehicleType = vehicle, pickupDistance = 5.0)
    private fun axis(vehicle: String?, f: FilterConfig = small) = Hwamul24Parser.judge(call(vehicle), f).axis

    @Test fun `다마스 차종 줄을 읽는다 - 시뮬 원문`() {
        val o = parser.parse("경기 광주 곤지암읍, ›, 서울 마포구 상암동, 당상, 수, 5, Km, 12:20, 수, 당착, 다마스/전체마대 1개, 독차, 계산서, 61,000, 원".split(", "))
        assertEquals("다마스/전체마대", o.vehicleType)
    }

    @Test fun `다마스 · 오토바이 콜은 작은 차 허용에서 차종으로 안 떨어진다`() {
        assertNotEquals("vehicle", axis("다마스/전체마대"))
        assertNotEquals("vehicle", axis("오토바이/전체서류봉투"))
    }

    @Test fun `1톤 콜은 작은 차 허용에서 그대로 차종으로 떨어진다`() = assertEquals("vehicle", axis("1톤/전체샘플"))

    @Test fun `11톤은 허용 1t 에 안 걸린다`() =
        assertEquals("vehicle", axis("11톤/윙", small.copy(allowedVehicleTypes = listOf("1t"))))

    @Test fun `모르는 낱말은 거르고 이상 기록은 하루 한 번`() {
        val sent = mutableListOf<String>()
        VehicleWordMiss.sink = { net, word, _ -> sent += "$net|$word" }
        try {
            val raw = "경기 광주 곤지암읍, ›, 서울 마포구 상암동, 당상, 수, 5, Km, 12:20, 수, 당착, 트럭/윙 1개, 독차, 계산서, 61,000, 원".split(", ")
            val o = parser.parse(raw)
            parser.parse(raw)
            assertNull(o.vehicleType)
            assertEquals("vehicle", axis(o.vehicleType))
            assertEquals(listOf("hwamul24|트럭"), sent)
            // 날이 바뀌면 다시 한 번
            VehicleWordMiss.record("hwamul24", "트럭", "트럭/윙", LocalDate.now().plusDays(1))
            assertEquals(2, sent.size)
        } finally { VehicleWordMiss.sink = null }
    }

    @Test fun `화물 글 · 배지 · 머리는 모르는 차종으로 안 올린다 - 실물 캡처 17`() {
        val sent = mutableListOf<String>()
        VehicleWordMiss.sink = { _, word, _ -> sent += word }
        try {
            val o = parser.parse(listOf("성공0건/최대15건", "경기 군포 부곡동", "›", "서울 중구 을지로6가", "당상", "수", "5Km", "05:12", "수", "당착",
                "1톤/전체", "지금상 당착 59박스 수/수-A", "당착/쿠팡반품건(부천1센터)/4파렛상하차", "독차", "인수증", "60,000원"))
            assertEquals("1톤/전체", o.vehicleType)
            assertEquals(emptyList<String>(), sent)
        } finally { VehicleWordMiss.sink = null }
    }
}
