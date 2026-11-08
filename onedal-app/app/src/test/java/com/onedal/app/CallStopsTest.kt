package com.onedal.app

import com.onedal.app.core.isReservedCall
import com.onedal.app.models.CallStop
import com.onedal.app.models.SimplifiedOfficeOrder
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * 📅 **원달앱 예약 콜 짝** — 공통 문제지 `pageReadCases.json` `reservedCallCases` 를 shared `isReservedCall` 과 같은 답으로 푼다.
 * 못 잡는 것: 정거장 약속을 읽는 일(`ReservationTextTest` · 배차망 예약 검사) · 서버 흐름 통계 묶기(서버 `callFlowStats` 검사).
 */
class CallStopsTest {
    private data class Case(val pickup: CallStop?, val dropoff: CallStop?, val reserved: Boolean, val why: String)

    private fun stopOf(j: com.google.gson.JsonElement?): CallStop? {
        if (j == null || j.isJsonNull) return null
        val o = j.asJsonObject
        fun text(k: String) = o[k]?.takeIf { !it.isJsonNull }?.asString
        return CallStop(listText = text("listText"), promiseText = text("promiseText"),
            requestedDay = o["requestedDay"]?.takeIf { !it.isJsonNull }?.asInt, requestedTime = text("requestedTime"))
    }

    private val cases: List<Case> = com.google.gson.JsonParser.parseString(File("../../onedal-web/shared/src/network/pageReadCases.json").readText())
        .asJsonObject["reservedCallCases"].asJsonArray.map { it.asJsonObject }
        .map { c -> Case(stopOf(c["pickup"]), stopOf(c["dropoff"]), c["reserved"].asBoolean, c["why"].asString) }

    @Test fun `공통 문제지 - shared 와 같은 답`() {
        assertTrue("문제지가 비었다", cases.size > 5)
        val wrong = cases.filter { c ->
            val o = SimplifiedOfficeOrder(id = "c", timestamp = "t", pickupDetails = listOfNotNull(c.pickup), dropoffDetails = listOfNotNull(c.dropoff))
            isReservedCall(o) != c.reserved
        }
        assertEquals(wrong.joinToString("\n") { it.why }, 0, wrong.size)
    }
}
