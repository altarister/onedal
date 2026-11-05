package com.onedal.app.plugins.hwamul24

import com.google.gson.Gson
import com.google.gson.JsonObject
import com.google.gson.JsonParser
import com.onedal.app.models.SimplifiedOfficeOrder
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import java.io.File

/**
 * 🎯 **화물24시가 채우는 기본 콜** (계획서 C5) — 문제지 `callMergeCases.json` 의 같은 입력으로 낸 값이 `expectBaseCall` 과 같다.
 * 서버 `callMergeSnapshot.test` 가 그 값을 합쳐 만든 옛 칸이 고정된 합친 값과 같은지 본다.
 */
class Hwamul24BaseCallTest {
    private val sheet = File("../../onedal-web/shared/src/network/callMergeCases.json").readText()
    private val cases = JsonParser.parseString(sheet).asJsonObject["cases"].asJsonArray.map { it.asJsonObject }.filter { it["network"].asString == "hwamul24" }
    private val gson = Gson()
    private val order = SimplifiedOfficeOrder(id = "c", pickup = "경기 군포 부곡동", dropoff = "서울 중구 을지로6가", fare = 60000, timestamp = "t")

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
            assertEquals(c["why"].asString, want["confirm"], toJson(Hwamul24BaseCall.of(first, list, rawText.takeIf { app["sameText"]?.asBoolean == true })))
            assertEquals(c["why"].asString, want["detail"], toJson(Hwamul24BaseCall.of(second, list, rawText)))
        }
    }

    @Test fun `결제방법 글자를 뜻대로 나눈다`() {
        fun money(word: String) = Hwamul24BaseCall.of(order, null, "운송료 60,000 결제방법 $word 배차신청").money
        assertEquals("선/착불", money("선/착불").paymentType)
        assertNull(money("선/착불").billingType)
        assertEquals("인수증", money("인수증").billingType)
        assertNull(money("인수증").paymentType)
        assertEquals("카드", money("카드").paymentType)
    }

    @Test fun `모르는 결제 글자는 안 담는다`() {
        val money = Hwamul24BaseCall.of(order, null, "운송료 60,000 결제방법 협의 배차신청").money
        assertNull(money.paymentType)
        assertNull(money.billingType)
    }

    @Test fun `하차 날 표시는 꼬리표에서 글자 그대로`() {
        assertEquals("내착", Hwamul24BaseCall.of(order.copy(tagsText = "당상 내착 독차"), null, null).time.dropoff?.text)
        assertNull(Hwamul24BaseCall.of(order.copy(tagsText = "당상 독차"), null, null).time.dropoff)
    }
}
