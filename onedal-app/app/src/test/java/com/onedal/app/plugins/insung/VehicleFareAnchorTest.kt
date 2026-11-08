package com.onedal.app.plugins.insung

import org.junit.Assert.assertEquals
import org.junit.Test
import com.onedal.app.models.CallMoney
import com.onedal.app.models.MoneyLine
import com.onedal.app.models.SimplifiedOfficeOrder

/**
 * 📏 **상차 거리 «1.4» 를 차종(1.4t)으로 읽지 않는다** (시뮬레이터 «7지점 한 바퀴» 폰 판)
 *
 * 인성 리스트 한 줄은 `상차거리, 배송거리, 시각/상차지, 하차지, 차종, 요금` 이다.
 * 파서는 차종 토큰을 닻으로 잡고 **바로 다음 숫자를 요금**으로 읽는다.
 *
 * 🔴 그런데 차종 토큰에 **«1.4»(1.4t 의 약자)** 가 있다 — 상차 거리 칸이 마침 1.4km 면 그 칸이 닻이 된다.
 *    같은 5t · 1만 5천 원 콜을 두 번 읽었는데 (서버 intel 에 남은 줄 글자 그대로):
 * ```
 * 04:27  2.2, 15.2, 낼8시8/초월읍, 중리동, 5t, 15.0      → 차종 5t  · 15,000원  (맞다)
 * 13:04  1.4, 15.2, 오후5시6/초월읍, 중리동, 5t, 15.0    → 차종 1.4 · 15,200원  (배송거리 15.2 를 요금으로)
 * ```
 * 그 판은 «1.4» 도 허용 차종 밖이라 **우연히** 차단이 맞았다. 허용 차종 콜의 상차 거리가 1.4·2.5·3.5km 면
 * 차종·요금을 틀리게 읽어 잘못 거르거나 잘못 잡는다.
 */
class VehicleFareAnchorTest {

    private fun read(row: String) = InsungParser.readVehicleAndFare(row.split(", "))

    @Test
    fun `상차 거리가 1점4 여도 차종은 5t 요금은 1만 5천 - 그날 13시04분 줄`() {
        assertEquals("5t" to 15_000, read("1.4, 15.2, 오후5시6/초월읍, 중리동, 5t, 15.0"))
    }

    @Test
    fun `상차 거리가 2점2 면 원래도 맞았다 - 그날 04시27분 줄`() {
        assertEquals("5t" to 15_000, read("2.2, 15.2, 낼8시8/초월읍, 중리동, 5t, 15.0"))
    }

    @Test
    fun `상차 거리 1점4 에 다마스 콜 - 차종 다 요금 5천`() {
        assertEquals("다" to 5_000, read("1.4, 3.3, 사음동, 중리동, 다, 5.0"))
    }

    @Test
    fun `상차 거리 2점5 에 다마스 콜 - 차종 다 요금 3천`() {
        assertEquals("다" to 3_000, read("2.5, 5.8, 중리동, 신둔면, 다, 3.0"))
    }

    @Test
    fun `진짜 1점4t 콜은 그대로 1점4`() {
        assertEquals("1.4" to 5_000, read("3.2, 10.1, 오후5시6/초월읍, 중리동, 1.4, 5.0"))
    }

    @Test
    fun `상차 거리도 차종도 1점4 면 뒤의 차종 칸을 읽는다`() {
        assertEquals("1.4" to 5_000, read("1.4, 2.5, 오후5시6/초월읍, 중리동, 1.4, 5.0"))
    }

    @Test
    fun `뭉친 노드 라2점2 는 그대로 읽는다`() {
        assertEquals("라" to 2_200, read("3.2, 10.1, 초월읍, 중리동, 라2.2"))
    }

    @Test
    fun `차종 칸이 용슬래시소 인 줄도 한 콜로 읽는다 - 영상 1719 의 요금 38점5(3만 8천5백 원)`() {
        assertEquals("용/소" to 38_500, read("9.8, 10.2, @2분동승+참, 논현동, 용/소, 38.5"))
    }

    @Test
    fun `요금 칸은 천 원 단위다 - 영상 1719 의 30점8 은 3만 800원 · 실물 캡처 270점0 은 27만 원`() {
        assertEquals("1t" to 30_800, read("3.2, 10.1, 초월읍, 중리동, 1t, 30.8"))
        assertEquals("1t" to 270_000, read("3.2, 341.0, 서울 강남, 부산 해운대, 1t, 270.0"))
    }

    @Test
    fun `소수 곱셈 오차로 1원 모자라지 않는다 - 32점3 은 32300원`() {
        assertEquals("1t" to 32_300, read("3.2, 10.1, 초월읍, 중리동, 1t, 32.3"))
        assertEquals("1t" to 64_100, read("3.2, 10.1, 초월읍, 중리동, 1t, 64.1"))
    }

    /*
     * 📏 거리 칸 — 줄 맨 앞 «N.N» 만인 노드 둘(윗줄 첫 상차 · 아랫줄 마지막 하차). 요금 · 차종 노드는 거리가 아니다.
     * 실물 스플릿 화면은 거리 칸이 한 줄인 줄이 있고 · 아랫줄 «0.0» 은 배송 거리 모름이다.
     */
    private fun km(row: String) = InsungParser.listDistancesOf(row.split(", "))

    @Test
    fun `거리 한 줄 콜 - 요금 26점9 는 하차 거리가 아니다`() {
        assertEquals(18.5 to null, km("18.5, 초월읍, 중리동, 다, 26.9"))
    }

    @Test
    fun `아랫줄 0점0 은 배송 거리 모름 - 빈 값`() {
        assertEquals(20.4 to null, km("20.4, 0.0, 초월읍, 중리동, 다, 26.9"))
    }

    @Test
    fun `거리 한 줄 콜 - 숫자 꼴 차종 1점4 도 하차 거리가 아니다`() {
        assertEquals(18.5 to null, km("18.5, 초월읍, 중리동, 1.4, 26.9"))
    }

    @Test
    fun `거리 두 줄 콜은 그대로 - 윗줄 상차 · 아랫줄 하차`() {
        assertEquals(2.2 to 11.1, km("2.2, 11.1, 급송/초월읍, 신둔면, 오, 42.0"))
        assertEquals(1.4 to 2.5, km("1.4, 2.5, 오후5시6/초월읍, 중리동, 1.4, 5.0"))
        assertEquals(3.2 to 10.1, km("3.2, 10.1, 초월읍, 중리동, 라2.2"))
    }

    /* 💰 요금 칸 → 돈 묶음 기사님 몫 줄(화면 글자 그대로) · 🚚 차종 칸 → 짐 묶음 차종 글자(맨 위 `vehicleType` 과 같은 글자) */
    private fun cells(row: String) = InsungParser.vehicleFareCellsOf(row.split(", "))

    @Test
    fun `요금 26점9 는 기사님 몫 2만 6천9백 원 줄 - 화면 글자 26점9`() {
        assertEquals(CallMoney(lines = listOf(MoneyLine("income", 26_900, "26.9"))), InsungParser.listMoneyOf(cells("18.5, 초월읍, 중리동, 다, 26.9")))
        assertEquals(CallMoney(lines = listOf(MoneyLine("income", 2_200, "2.2"))), InsungParser.listMoneyOf(cells("3.2, 10.1, 초월읍, 중리동, 라2.2")))
    }

    @Test
    fun `요금을 못 읽으면 돈 묶음 없음`() {
        assertEquals(null, InsungParser.listMoneyOf(cells("18.5, 초월읍, 중리동, 다")))
    }

    @Test
    fun `차종 칸은 짐 묶음 차종 글자 - 맨 위 차종과 같은 글자`() {
        val c = cells("18.5, 초월읍, 중리동, 1.4, 26.9")
        val order = SimplifiedOfficeOrder(id = "c1", timestamp = "t", vehicleType = c.vehicle, money = InsungParser.listMoneyOf(c))
        assertEquals("1.4", order.load?.vehicleText)
        assertEquals(order.vehicleType, order.load?.vehicleText)
    }
}
