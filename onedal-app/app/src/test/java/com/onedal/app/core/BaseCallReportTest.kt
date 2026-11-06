package com.onedal.app.core

import com.google.gson.Gson
import com.onedal.app.models.BaseCall
import com.onedal.app.models.CallJob
import com.onedal.app.models.CallLoad
import com.onedal.app.models.CallMoney
import com.onedal.app.models.CallRoute
import com.onedal.app.models.CallStop
import com.onedal.app.models.CallTime
import com.onedal.app.models.DispatchBasicRequest
import com.onedal.app.models.DispatchDetailedRequest
import com.onedal.app.models.ReportEnvelope
import com.onedal.app.models.ScrapPayload
import com.onedal.app.models.SimplifiedOfficeOrder
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** 🎯 **보고의 기본 콜 조각** (계획서 C1 · F2-b) — 보고에는 늘 기본 콜이 실리고 order 는 없다. 플러그인이 못 채우면 평평 콜로 만든 최소 기본 콜 */
class BaseCallReportTest {
    private fun call(id: String = "임시") = BaseCall(
        id = id, targetApp = "kakaopicker", route = CallRoute(pickup = CallStop(), dropoff = CallStop()),
        money = CallMoney(lines = emptyList()), load = CallLoad(), time = CallTime(), job = CallJob(),
    )
    private val order = SimplifiedOfficeOrder(id = "c1", pickup = "a", dropoff = "b", fare = 1, timestamp = "t")

    private val report = ReportEnvelope(type = "AUTO_CLICK", rawText = "목록 글자", timestamp = "t")

    @Test fun `보고 몸통에 order 칸이 아예 없고 봉투 세 값과 기본 콜이 실린다`() {
        val part = BaseCallReport.partOf(order, "insung", "목록 글자") { call() }
        val json = Gson().toJson(DispatchBasicRequest(deviceId = "d", report = report, capturedAt = "t", baseCall = part.baseCall, evidence = part.evidence))
        assertFalse(json, json.contains("\"order\""))
        assertTrue(json, json.contains("\"report\":{\"type\":\"AUTO_CLICK\",\"rawText\":\"목록 글자\",\"timestamp\":\"t\"}"))
        assertTrue(json, json.contains("\"baseCall\":{\"id\":\"c1\""))
    }

    @Test fun `플러그인이 안 채우면 평평 콜로 만든 최소 기본 콜 — 요금은 «옛 요금» 한 줄 · 기록은 간다`() {
        val part = BaseCallReport.partOf(order.copy(pickup = "경기 광주시 경안동", dropoff = "한남동", fare = 30000, vehicleType = "다마스"), "kakaopicker", "목록 글자") { null }
        assertEquals("c1", part.baseCall.id)
        assertEquals("kakaopicker", part.baseCall.targetApp)
        assertEquals("경기 광주시 경안동", part.baseCall.route.pickup.addressDetail)
        assertEquals("한남동", part.baseCall.route.listRegion?.dropoff)
        assertEquals(listOf(Triple("unknown", 30000.0, "옛 요금")), part.baseCall.money.lines.map { Triple(it.kind, it.won, it.label) })
        assertEquals("다마스", part.baseCall.load.vehicleType)
        assertEquals("목록 글자", part.evidence?.seen?.single()?.rawText)
    }

    @Test fun `목록 보고는 «새 양식» 표시를 늘 싣는다`() {
        val json = Gson().toJson(ScrapPayload(deviceId = "d", data = emptyList()))
        assertTrue(json, json.contains("\"reportsBaseCall\":true"))
    }

    @Test fun `번호는 보내는 콜의 번호로 맞춘다`() {
        assertEquals("c1", BaseCallReport.partOf(order, "insung", null) { call() }.baseCall.id)
    }

    @Test fun `기록에는 누른 목록 줄 하나만 간다`() {
        val seen = BaseCallReport.partOf(order, "insung", "@낼7시/초이동") { call() }.evidence!!.seen
        assertEquals(1, seen.size)
        assertEquals("newList", seen[0].screen)
        assertEquals("@낼7시/초이동", seen[0].rawText)
        assertNull(BaseCallReport.partOf(order, "insung", null) { call() }.evidence)
        assertNull(BaseCallReport.partOf(order, "insung", " ") { call() }.evidence)
    }

    @Test fun `조립이 터져도 최소 기본 콜과 기록이 간다`() {
        val part = BaseCallReport.partOf(order, "insung", "목록 글자") { error("플러그인 고장") }
        assertEquals("c1", part.baseCall.id)
        assertEquals("목록 글자", part.evidence?.seen?.single()?.rawText)
    }

    @Test fun `Error 가 나도 최소 기본 콜이 간다 — TODO · 재귀 넘침`() {
        assertEquals("c1", BaseCallReport.partOf(order, "insung", null) { TODO("아직") }.baseCall.id)
        assertEquals("c1", BaseCallReport.partOf(order, "insung", null) { throw StackOverflowError() }.baseCall.id)
    }

    @Test fun `짧은 주소는 상세 주소가 아니라 목록 동이다 — 목록 콜이 없어도`() {
        val short = order.copy(pickup = "독산동", dropoff = "서울 용산구 한남동")
        val fill = BaseCallFill(com.onedal.app.plugins.insung.InsungPages.pages, short, null, null)
        assertNull(fill.address(short.pickup))
        assertEquals("서울 용산구 한남동", fill.address(short.dropoff))
        assertEquals("독산동", fill.listRegion?.pickup)
        assertNull(fill.listRegion?.dropoff)
    }

    @Test fun `전체 주소뿐인 손 상세는 목록 동이 없다`() {
        val full = order.copy(pickup = "경기 광주시 경안동", dropoff = "서울 용산구 한남동")
        assertNull(BaseCallFill(com.onedal.app.plugins.insung.InsungPages.pages, full, null, null).listRegion)
    }

    @Test fun `보고 크기는 요청 한도 안이다 — 상세 글 20KB 가 원문과 기록에 두 번 · 빈 기본 콜`() {
        val body = Gson().toJson(DispatchDetailedRequest(deviceId = "d", report = ReportEnvelope(type = "NEW_ORDER", rawText = "가".repeat(6700), timestamp = "t"),
            capturedAt = "t", baseCall = call(), evidence = BaseCallReport.partOf(order, "insung", "가".repeat(6700), screen = "newCall") { call() }.evidence))
        val size = body.toByteArray().size
        println("📏 [보고 크기] 상세 글 6,700자 두 번 + 기본 콜 = $size 바이트")
        assertTrue("요청 한도 100KB 안", size < 100_000)
    }
}
