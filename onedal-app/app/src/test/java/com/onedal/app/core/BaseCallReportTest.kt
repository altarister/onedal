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
import com.onedal.app.models.DetailedOfficeOrder
import com.onedal.app.models.SimplifiedOfficeOrder
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** 🎯 **보고의 기본 콜 조각** (계획서 C1) — 채우지 않는 동안 보고 글자가 지금과 같고, 조립이 터져도 옛 보고는 나간다 */
class BaseCallReportTest {
    private fun call(id: String = "임시") = BaseCall(
        id = id, targetApp = "kakaopicker", route = CallRoute(pickup = CallStop(), dropoff = CallStop()),
        money = CallMoney(lines = emptyList()), load = CallLoad(), time = CallTime(), job = CallJob(),
    )
    private val order = SimplifiedOfficeOrder(id = "c1", pickup = "a", dropoff = "b", fare = 1, timestamp = "t")

    @Test fun `플러그인이 안 채우면 보고 글자에 새 칸이 없다`() {
        val part = BaseCallReport.partOf("c1", "t", "목록 글자") { null }
        assertNull(part.baseCall)
        assertNull(part.evidence)
        val json = Gson().toJson(DispatchBasicRequest(deviceId = "d", order = order, capturedAt = "t", baseCall = part.baseCall, evidence = part.evidence))
        assertFalse(json, json.contains("baseCall") || json.contains("evidence"))
        assertEquals(Gson().toJson(DispatchBasicRequest(deviceId = "d", order = order, capturedAt = "t")), json)
    }

    @Test fun `번호는 보내는 콜의 번호로 맞춘다`() {
        assertEquals("c1", BaseCallReport.partOf("c1", "t", null) { call() }.baseCall?.id)
    }

    @Test fun `기록에는 누른 목록 줄 하나만 간다`() {
        val seen = BaseCallReport.partOf("c1", "t", "@낼7시/초이동") { call() }.evidence!!.seen
        assertEquals(1, seen.size)
        assertEquals("newList", seen[0].screen)
        assertEquals("@낼7시/초이동", seen[0].rawText)
        assertNull(BaseCallReport.partOf("c1", "t", null) { call() }.evidence)
        assertNull(BaseCallReport.partOf("c1", "t", " ") { call() }.evidence)
    }

    @Test fun `조립이 터져도 옛 보고는 나간다`() {
        val part = BaseCallReport.partOf("c1", "t", "목록 글자") { error("플러그인 고장") }
        assertNull(part.baseCall)
        assertNull(part.evidence)
    }

    @Test fun `Error 가 나도 옛 보고는 나간다 — TODO · 재귀 넘침`() {
        assertNull(BaseCallReport.partOf("c1", "t", null) { TODO("아직") }.baseCall)
        assertNull(BaseCallReport.partOf("c1", "t", null) { throw StackOverflowError() }.baseCall)
    }

    @Test fun `보고 크기는 요청 한도 안이다 — 상세 글 20KB 와 빈 기본 콜`() {
        val body = Gson().toJson(DispatchDetailedRequest(deviceId = "d", order = DetailedOfficeOrder(id = "c1", type = "NEW_ORDER", pickup = "a", dropoff = "b", fare = 1, timestamp = "t", rawText = "가".repeat(6700)),
            capturedAt = "t", baseCall = call()))
        val size = body.toByteArray().size
        println("📏 [보고 크기] 상세 글 6,700자 + 기본 콜 = $size 바이트")
        assertTrue("요청 한도 100KB 안", size < 100_000)
    }
}
