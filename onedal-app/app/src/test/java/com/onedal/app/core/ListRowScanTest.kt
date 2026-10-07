package com.onedal.app.core

import com.onedal.app.models.FilterTally
import com.onedal.app.models.SimplifiedOfficeOrder
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * 📋 **목록 한 줄 처리 — 건너뛰기 · 판정 · 기억 · 보고** (`ListRowScan.scanRow`).
 * 줄을 다 읽었나 · 이미 본 콜인가 · 통과 콜을 기억에 넣나 같은 차례가 빠져도 이 검사 전에는 아무 검사도 몰랐다(소스 글자 검사만).
 * 실제 `CallMemory` · `AlarmedRoutes` · `FilterTally` 에 가짜 파서(필터 결과만 정함)를 물려 돌린다.
 */
class ListRowScanTest {

    private class FakeParser : IScrapParser {
        val orders = mutableMapOf<String, SimplifiedOfficeOrder>()
        var pass = true
        var locked = false
        var verdict: String? = null
        var radius: Double? = null
        override fun parse(texts: List<String>) = orders[texts.firstOrNull()] ?: SimplifiedOfficeOrder(id = "x", pickup = "", dropoff = "", fare = 0, timestamp = "t")
        override fun todayPickupRadiusKm() = radius
        /** 실물 파서처럼 — 잠겨 있으면 성적표를 안 올리고 막는다 */
        override fun shouldClick(order: SimplifiedOfficeOrder, tally: FilterTally?): Boolean {
            if (locked) return false
            tally?.let { it.seen++ }
            return pass
        }
        override fun withVerdict(order: SimplifiedOfficeOrder, tally: FilterTally?) = order.copy(verdict = verdict)
        override fun reservationMode(): String? = null
        override fun matchDetailOrder(screenTexts: List<String>, recentOrders: List<SimplifiedOfficeOrder>): SimplifiedOfficeOrder? = null
        override fun groupListNodes(allNodes: List<ScreenTextNode>): List<Pair<ScreenTextNode, List<String>>> = emptyList()
        override val lastFrameDiscarded = false
        override fun alarmBandHalfPx() = 0
    }

    private val parser = FakeParser()
    private val memory = CallMemory()
    private val routes = AlarmedRoutes()
    private val reported = mutableListOf<SimplifiedOfficeOrder>()
    private var tally = FilterTally()

    private fun scan(accountBlocked: Boolean = false) = ListRowScan(parser, memory, routes, tally, accountBlocked, nowMs = 1_000L, listScanNo = 1L,
        currentTargetApp = "hwamul24", allowsEmptyDropoff = { false }, report = { reported += it })

    private val call = SimplifiedOfficeOrder(id = "c1", pickup = "경기 광주 초월읍", dropoff = "경기 이천 신둔면", fare = 50000, timestamp = "t", pickupDistance = 3.0)
    private fun row(o: SimplifiedOfficeOrder = call): List<String> { parser.orders["row"] = o; return listOf("row") }

    @Test fun `요금을 못 읽은 줄은 그 자리에서 뺀다 — 판정 · 보고 · 기억 없음`() {
        val out = scan().scanRow(row(call.copy(fare = 0)))
        assertEquals(ListRowScan.Kind.FARE_FAIL, out.kind)
        assertEquals(0, tally.seen); assertTrue(reported.isEmpty())
    }

    @Test fun `덜 읽힌 줄(상차 거리 없음)은 그 스캔에서 뺀다 — 판정 · 보고 · 기억 없음`() {
        val o = call.copy(pickupDistance = null)
        val out = scan().scanRow(row(o))
        assertEquals(ListRowScan.Kind.UNREAD, out.kind)
        assertEquals(0, tally.seen); assertTrue(reported.isEmpty())
        assertFalse(memory.alreadyEvaluated(CallMemory.fingerprintOf(o)))
    }

    @Test fun `이미 본 콜은 건너뛴다 — 다시 판정하지도 보고하지도 않는다`() {
        memory.markEvaluated(CallMemory.fingerprintOf(call))
        val out = scan().scanRow(row())
        assertEquals(ListRowScan.Kind.SEEN, out.kind)
        assertEquals(0, tally.seen); assertTrue(reported.isEmpty()); assertFalse(out.addHit)
    }

    @Test fun `통과 콜은 누를 후보가 되고 새로 세고 보고는 한 번 — 기억에는 안 넣는다`() {
        val first = scan().scanRow(row())
        assertEquals(ListRowScan.Kind.SCANNED, first.kind)
        assertTrue(first.addHit); assertEquals(1, tally.passedNew); assertEquals(1, reported.size)
        assertFalse("통과 콜을 기억하면 이번에 안 누른 둘째 좋은 콜이 다음 스캔에 «이미 본 콜»로 사라진다", memory.alreadyEvaluated(first.orderHash))
        tally = FilterTally()
        val again = scan().scanRow(row())
        assertEquals(ListRowScan.Kind.SCANNED, again.kind); assertTrue(again.addHit)
        assertEquals("보고는 콜당 한 번", 1, reported.size)
        assertEquals("이미 알람감이 된 콜은 새로 안 센다", 0, tally.passedNew)
    }

    @Test fun `막힌 콜은 기억에 넣고 후보가 아니다 — 보고에는 판정이 실린다`() {
        parser.pass = false; parser.verdict = "fare"
        val out = scan().scanRow(row())
        assertFalse(out.addHit); assertTrue(memory.alreadyEvaluated(out.orderHash)); assertEquals(1, reported.size)
        assertEquals("현황판이 판정을 다시 재지 않게 판정을 실어 올린다", "fare", reported.first().verdict)
    }

    @Test fun `막힌 계정이면 통과 조건이어도 후보가 아니고 판정도 안 해 기억에 안 남는다`() {
        val out = scan(accountBlocked = true).scanRow(row())
        assertFalse(out.addHit); assertEquals(0, tally.seen); assertFalse(memory.alreadyEvaluated(out.orderHash))
    }

    @Test fun `이미 연 콜은 요금만 올라도 다시 후보가 안 된다`() {
        routes.markOpened(call, 500L)
        val out = scan().scanRow(row())
        assertFalse(out.addHit)
    }

    @Test fun `필터가 잠겨(선점 중) 평가가 안 돈 콜은 기억에 안 남겨 다음 스캔에서 처음처럼 본다`() {
        parser.locked = true
        val out = scan().scanRow(row())
        assertEquals(ListRowScan.Kind.SCANNED, out.kind); assertFalse(out.addHit)
        assertFalse(memory.alreadyEvaluated(out.orderHash))
    }

    @Test fun `상차 반경으로 막았던 콜이 가까워지면 다시 판정한다`() {
        parser.pass = false; parser.verdict = "pickup"
        val far = call.copy(pickupDistance = 10.0)
        scan().scanRow(row(far))
        assertTrue(memory.alreadyEvaluated(CallMemory.fingerprintOf(far)))
        parser.pass = true; parser.radius = 5.0
        val near = scan().scanRow(row(far.copy(pickupDistance = 3.0)))
        assertEquals(ListRowScan.Kind.SCANNED, near.kind); assertTrue(near.addHit)
    }

    @Test fun `내일 이후 콜은 가까워져도 폰 km 로 풀지 않는다`() {
        parser.pass = false; parser.verdict = "pickup"
        val tomorrow = call.copy(pickupDistance = 10.0, reservedDay = 1)
        scan().scanRow(row(tomorrow))
        parser.pass = true; parser.radius = 5.0
        assertEquals(ListRowScan.Kind.SEEN, scan().scanRow(row(tomorrow.copy(pickupDistance = 3.0))).kind)
    }

    @Test fun `상차 탓이 아닌 막음(요금 · 도착)은 km 를 안 적어 가까워져도 안 푼다`() {
        parser.pass = false; parser.verdict = "fare"
        val far = call.copy(pickupDistance = 10.0)
        scan().scanRow(row(far))
        parser.pass = true; parser.radius = 5.0
        assertEquals(ListRowScan.Kind.SEEN, scan().scanRow(row(far.copy(pickupDistance = 3.0))).kind)
    }
}
