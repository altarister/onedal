package com.onedal.app.plugins.insung

import com.google.gson.Gson
import com.google.gson.JsonObject
import com.google.gson.JsonParser
import com.onedal.app.models.SimplifiedOfficeOrder
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import java.io.File

/**
 * 🎯 **인성이 채우는 기본 콜** (계획서 C4) — 문제지 `callMergeCases.json` 의 같은 입력으로 낸 값이 `expectBaseCall` 과 같다.
 * 서버 `callMergeSnapshot.test` 가 그 값을 합쳐 만든 옛 칸이 고정된 합친 값과 같은지 본다.
 */
class InsungBaseCallTest {
    private val sheet = File("../../onedal-web/shared/src/network/callMergeCases.json").readText()
    private val cases = JsonParser.parseString(sheet).asJsonObject["cases"].asJsonArray.map { it.asJsonObject }.filter { it["network"].asString == "insung" && it.has("expectBaseCall") }
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
            assertEquals(c["why"].asString, want["confirm"], toJson(InsungBaseCall.of(first, list, rawText.takeIf { app["sameText"]?.asBoolean == true })))
            assertEquals(c["why"].asString, want["detail"], toJson(InsungBaseCall.of(second, list, rawText)))
        }
    }

    @Test fun `실제 채우기 길의 주소가 문제지의 첫 보고와 같다`() {
        val c = cases.first { it["appInput"].asJsonObject["sameText"]?.asBoolean == true }
        val rawText = c["detail"].asJsonObject["rawText"].asString
        val want = flat(c["confirm"].asJsonObject)
        assertEquals(want.pickup, InsungPopupAddress.of(rawText, InsungPopupAddress.PICKUP_TAG))
        assertEquals(want.dropoff, InsungPopupAddress.of(rawText, InsungPopupAddress.DROPOFF_TAG))
    }

    @Test fun `팝업이 없는 글은 연락처를 안 담고 본문 적요를 담는다`() {
        val order = SimplifiedOfficeOrder(id = "c", pickup = "경기 광주시 경안동", dropoff = "서울 용산구 한남동", fare = 1000, timestamp = "t")
        val call = InsungBaseCall.of(order, null, "상태 : 신규\n적요상세 10시전하차")
        assertNull(call.route.pickup.customerName)
        assertNull(call.route.dropoff.phone1)
        assertEquals("10시전하차", call.job.detailMemo)
    }

    @Test fun `값 목록에 없는 결제 글자는 안 담는다`() {
        val order = SimplifiedOfficeOrder(id = "c", pickup = "경기 광주시 경안동", dropoff = "서울 용산구 한남동", fare = 1000, timestamp = "t")
        assertNull(InsungBaseCall.of(order, null, "요금 : 1,000(협의)").money.paymentType)
    }

    @Test fun `글이 비면 찾은 값만 담는다`() {
        val order = SimplifiedOfficeOrder(id = "c", pickup = "경기 광주시 경안동", dropoff = "서울 용산구 한남동", fare = 1000, timestamp = "t", vehicleType = "다")
        val call = InsungBaseCall.of(order, null, " ")
        assertNull(call.stage)
        assertNull(call.money.paymentType)
        assertEquals("다", call.load.vehicleType)
        assertEquals(1, call.money.lines.size)
    }
}
