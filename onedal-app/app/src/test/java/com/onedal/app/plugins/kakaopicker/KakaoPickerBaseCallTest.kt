package com.onedal.app.plugins.kakaopicker

import com.google.gson.Gson
import com.google.gson.JsonObject
import com.google.gson.JsonParser
import com.onedal.app.models.SimplifiedOfficeOrder
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import java.io.File

/**
 * 🎯 **픽커가 채우는 기본 콜** (계획서 C2) — 문제지 `callMergeCases.json` 의 같은 입력으로 낸 값이 `expectBaseCall` 과 같다.
 * 서버 `callMergeSnapshot.test` 가 그 값을 합쳐 만든 옛 칸이 고정된 합친 값과 같은지 본다. 둘이 이어져야 C2 끝 조건이다.
 */
class KakaoPickerBaseCallTest {
    private val sheet = File("../../onedal-web/shared/src/network/callMergeCases.json").readText()
    private val cases = JsonParser.parseString(sheet).asJsonObject["cases"].asJsonArray.map { it.asJsonObject }.filter { it["network"].asString == "kakaopicker" }
    private val gson = Gson()

    private fun flat(json: JsonObject, id: String = "c") = gson.fromJson(json.deepCopy().apply { addProperty("id", id); addProperty("timestamp", "t"); addProperty("type", "NEW_ORDER") }, SimplifiedOfficeOrder::class.java)

    /** 첫 보고 · 상세 보고 — 앱은 상세의 주소로 덮은 콜을 보낸다 */
    private fun reports(c: JsonObject): Pair<JsonObject, JsonObject> {
        val first = flat(c["confirm"].asJsonObject)
        val hand = c["why"].asString.contains("사진 길")
        val list = if (hand) null else first
        val photo = if (hand) PickerDetailFromImage(pickup = PickerStopFromImage("경기 성남시 수정구 신촌동", null, 18.9, null), dropoff = PickerStopFromImage("서울 광진구 자양2동", "NC이스트폴", 9.7, null), itemSize = null, reserved = false) else null
        val detail = c["detail"].asJsonObject
        val second = first.copy(pickup = detail["pickup"].asString, dropoff = detail["dropoff"].asString, fare = detail["fare"].asInt)
        val toJson = { o: Any -> gson.toJsonTree(o).asJsonObject.apply { remove("id") } }
        return toJson(KakaoPickerBaseCall.of(first, list, photo, null)) to toJson(KakaoPickerBaseCall.of(second, list, photo, detail["rawText"].asString))
    }

    @Test fun `같은 입력은 문제지의 기본 콜이 된다`() {
        for (c in cases) {
            val (first, second) = reports(c)
            val want = c["expectBaseCall"].asJsonObject
            assertEquals(c["why"].asString, want["confirm"], first)
            assertEquals(c["why"].asString, want["detail"], second)
        }
    }

    @Test fun `목록 동은 목록 콜에서 오고 상세로 덮이지 않는다`() {
        val list = SimplifiedOfficeOrder(id = "c", pickup = "광주 경안", dropoff = "강남 역삼1", fare = 1000, timestamp = "t")
        val call = KakaoPickerBaseCall.of(list.copy(pickup = "경기 광주시 경안동", dropoff = "서울 강남구 역삼1동"), list, null, null)
        assertEquals("광주 경안", call.route.listRegion?.pickup)
        assertEquals("경기 광주시 경안동", call.route.pickup.addressDetail)
    }

    @Test fun `목록 동만 아는 첫 보고는 주소 칸을 안 채운다`() {
        val list = SimplifiedOfficeOrder(id = "c", pickup = "광주 경안", dropoff = "강남 역삼1", fare = 1000, timestamp = "t")
        assertNull(KakaoPickerBaseCall.of(list, list, null, null).route.pickup.addressDetail)
    }

    @Test fun `요금이 없으면 금액 줄을 안 만든다`() {
        val call = KakaoPickerBaseCall.of(SimplifiedOfficeOrder(id = "c", pickup = "a", dropoff = "b", fare = 0, timestamp = "t"), null, null, null)
        assertEquals(0, call.money.lines.size)
    }
}
