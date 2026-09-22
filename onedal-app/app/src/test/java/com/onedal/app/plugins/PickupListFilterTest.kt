package com.onedal.app.plugins

import com.onedal.app.models.FilterConfig
import com.onedal.app.models.FilterTally
import com.onedal.app.models.SimplifiedOfficeOrder
import com.onedal.app.plugins.insung.InsungParser
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * 📋 **상차 목록으로 거른다 — 2단계 원달앱** (하차 목록»).
 *
 * 이천 왕복 03:08:52 D3: 이천터미널에 서서 집 가는 앞길 위 «신둔면 → 곤지암읍» 콜을
 * `RouteOrderFilter` 가 «경로 밖 — 상차지(신둔면)가 경유 목록에 없음»으로 막았다 (폰 logcat 원문).
 * 서버가 이제 «내 위치 둘레»로 상차 목록을 보내고, 거기 신둔면이 든다 (서버 `pickupListGeo.test.ts`).
 */
class PickupListFilterTest {

    @Test
    fun `빈 상차 목록은 고장이다 - 잡지 않는다 (규칙 ④)`() {
        assertFalse(PickupListFilter.check("신둔면", emptyList(), emptyMap()).passed)
    }

    @Test
    fun `목록에 걸리면 통과 · 안 걸리면 막는다`() {
        assertTrue(PickupListFilter.check("경기 이천시 신둔면", listOf("신둔면", "곤지암읍"), emptyMap()).passed)
        assertFalse(PickupListFilter.check("경기 이천시 호법면", listOf("신둔면", "곤지암읍"), emptyMap()).passed)
    }

    @Test
    fun `오탐 막는 낱말은 하차 목록과 같은 한 벌을 쓴다 - 남동이 인천 남동구에 걸리지 않는다`() {
        val traps = mapOf("남동" to listOf("남동구"))
        assertFalse(PickupListFilter.check("인천 남동구 구월동", listOf("남동"), traps).passed)
        assertTrue(PickupListFilter.check("광주 남동", listOf("남동"), traps).passed)
    }

    @Test
    fun `구 단위 상차지는 막힌다 - 상차 목록에는 읍면동만 싣는다 (기사님 결정 ③ 가)`() {
        assertFalse(PickupListFilter.check("분당구", listOf("서현1동", "정자동"), emptyMap()).passed)
    }

    @Test
    fun `인성 상세 글에서 출발지 칸만 자른다 - 하차지 동이 상차 목록에 걸려 통과하지 않게`() {
        val raw = "요금 : 30,000(신용), 출발지, 태양메디스 / 17:10 / 호법면, 도착지, [착]곤지암읍 / , 확정(10)"
        val cut = PickupListFilter.insungDetailPickupText(raw)!!
        assertTrue(cut.contains("호법면"))
        assertFalse(cut.contains("곤지암읍"))
        assertEquals(null, PickupListFilter.insungDetailPickupText("요금 : 30,000 도착지 곤지암읍"))
    }

    // ── 인성 파서 판정 ──

    /** 03:08:40 폰이 받은 필터 모양 — 순서표에 신둔면이 빠진 뒤 (서버 로그·logcat) */
    private fun filter(pickupKeywords: List<String>?) = FilterConfig(
        allowedVehicleTypes = listOf("오토바이", "다마스", "라보", "승용차"),
        isActive = true,
        isSharedMode = true,
        pickupRadiusKm = 4.55,
        minFare = 20000,
        destinationCity = "광주시",
        destinationKeywords = listOf("곤지암읍", "초월읍", "도척면", "갈산동", "송정동"),
        customCityFilters = listOf("광주시", "광주", "이천시", "이천"),
        orderKm = mapOf("곤지암읍" to 20.2, "초월읍" to 27.7, "갈산동" to 9.6, "송정동" to 11.1),
        pickupKeywords = pickupKeywords,
    )

    private val d3 = SimplifiedOfficeOrder(
        id = "D3", type = "NEW_ORDER", pickup = "신둔면", dropoff = "곤지암읍", fare = 30000,
        timestamp = "2026-09-15T03:08:52", vehicleType = "승",
        rawText = "신둔면 곤지암읍", pickupDistance = 7.1, deliveryDistance = 7.0,
    )

    @Test
    fun `D3 - 옛 서버(칸 없음)면 순서표에 막히고, 상차 목록이 오면 통과한다`() {
        assertEquals(InsungParser.Companion.Verdict(false, "routeOrder"), InsungParser.judge(d3, filter(pickupKeywords = null)))
        assertEquals(InsungParser.Companion.Verdict(true, "pass"), InsungParser.judge(d3, filter(pickupKeywords = listOf("중리동", "신둔면", "관고동"))))
    }

    @Test
    fun `상차 목록 밖이면 막힌 칸은 pickupList 이고 성적표에도 그 칸으로 센다`() {
        val tally = FilterTally()
        assertEquals(InsungParser.Companion.Verdict(false, "pickupList"), InsungParser.judge(d3, filter(listOf("중리동", "관고동")), tally))
        assertEquals(1, tally.pickupList)
        assertEquals(0, tally.pickup)
        assertEquals(0, tally.routeOrder)
    }

    @Test
    fun `빈 상차 목록이 오면 파서도 막는다`() {
        assertEquals(InsungParser.Companion.Verdict(false, "pickupList"), InsungParser.judge(d3, filter(emptyList())))
    }

    @Test
    fun `상차 목록이 오면 상차 반경 숫자로는 안 막는다 - 첫짐이어도`() {
        val far = d3.copy(pickupDistance = 30.0)
        val firstLoad = filter(listOf("신둔면")).copy(isSharedMode = false, orderKm = emptyMap())
        assertEquals(InsungParser.Companion.Verdict(true, "pass"), InsungParser.judge(far, firstLoad))
        // 옛 서버면 같은 콜이 반경(4.55km)에 막힌다
        assertEquals(InsungParser.Companion.Verdict(false, "pickup"), InsungParser.judge(far, firstLoad.copy(pickupKeywords = null)))
    }
}
