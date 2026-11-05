package com.onedal.app.plugins.isflex

import com.google.gson.Gson
import com.google.gson.JsonObject
import com.google.gson.JsonParser
import com.onedal.app.models.SimplifiedOfficeOrder
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import java.io.File
import java.time.LocalDateTime

/**
 * 🎯 **플렉스가 채우는 기본 콜** (계획서 C3) — 문제지 `callMergeCases.json` 의 같은 입력으로 낸 값이 `expectBaseCall` 과 같다.
 * 서버 `callMergeSnapshot.test` 가 그 값을 합쳐 만든 옛 칸이 고정된 합친 값과 같은지 본다.
 */
class IsflexBaseCallTest {
    private val sheet = File("../../onedal-web/shared/src/network/callMergeCases.json").readText()
    private val cases = JsonParser.parseString(sheet).asJsonObject["cases"].asJsonArray.map { it.asJsonObject }.filter { it["network"].asString == "isflex" }
    private val gson = Gson()

    private fun flat(json: JsonObject) = gson.fromJson(json.deepCopy().apply { addProperty("id", "c"); addProperty("timestamp", "t"); addProperty("type", "NEW_ORDER") }, SimplifiedOfficeOrder::class.java)

    @Test fun `같은 입력은 문제지의 기본 콜이 된다`() {
        for (c in cases) {
            val app = c["appInput"].asJsonObject
            val list = flat(app["listOrder"].asJsonObject)
            val detail = c["detail"].asJsonObject
            val first = flat(c["confirm"].asJsonObject)
            val second = first.copy(pickup = detail["pickup"].asString, dropoff = detail["dropoff"].asString, fare = detail["fare"].asInt)
            val rawText = detail["rawText"].asString
            val toJson = { o: Any -> gson.toJsonTree(o).asJsonObject.apply { remove("id") } }
            val want = c["expectBaseCall"].asJsonObject
            assertEquals(c["why"].asString, want["confirm"], toJson(IsflexBaseCall.of(first, list, rawText.takeIf { app["sameText"]?.asBoolean == true })))
            assertEquals(c["why"].asString, want["detail"], toJson(IsflexBaseCall.of(second, list, rawText)))
        }
    }

    @Test fun `실제 채우기 길의 콜이 문제지의 첫 보고와 같다`() {
        val c = cases.first { it["why"].asString.contains("D08") }
        val list = flat(c["appInput"].asJsonObject["listOrder"].asJsonObject)
        val filled = IsflexParser.fillFromDetail(list.copy(rawText = c["detail"].asJsonObject["rawText"].asString), LocalDateTime.now())
        val want = flat(c["confirm"].asJsonObject)
        assertEquals(want.pickup, filled.pickup)
        assertEquals(want.dropoff, filled.dropoff)
        assertEquals(want.tagsText, filled.tagsText)
        assertEquals(want.reserved, filled.reserved)
        assertEquals(want.scheduleText, filled.scheduleText)
    }

    @Test fun `적요 «없음»은 안 담고 결제 글자가 없으면 결제 칸도 비운다`() {
        val order = SimplifiedOfficeOrder(id = "c", pickup = "서울 강남구 역삼동", dropoff = "서울 강남구 대치동", fare = 8500, timestamp = "t")
        val call = IsflexBaseCall.of(order, null, "출발지까지 26.7km 오토 출발 @서울 강남구 @역삼동 약 2.3km 도착 서울 강남구 대치동 적요상세 없음 총 수입 8,500원 닫기")
        assertNull(call.job.detailMemo)
        assertNull(call.money.paymentType)
    }

    @Test fun `손으로 연 콜은 목록 동과 공유 표시가 없다`() {
        val order = SimplifiedOfficeOrder(id = "c", pickup = "서울 강남구 역삼동", dropoff = "서울 강남구 대치동", fare = 8500, timestamp = "t")
        val call = IsflexBaseCall.of(order, null, null)
        assertNull(call.route.listRegion)
        assertNull(call.fromOtherOffice)
        assertEquals("서울 강남구 역삼동", call.route.pickup.addressDetail)
    }
}
