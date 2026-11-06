package com.onedal.app.plugins.kakaopicker

import com.google.gson.Gson
import com.google.gson.JsonObject
import com.google.gson.JsonParser
import com.onedal.app.core.BaseCallReport
import com.onedal.app.core.engine.SessionManager
import com.onedal.app.models.ReportEnvelope
import com.onedal.app.models.DispatchDetailedRequest
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

    /** 첫 보고 · 상세 보고 — `appInput` 이 앱의 세션 값이다. 사진 길은 사진 뒤에 두 보고를 같은 값으로 보낸다(`sameText`) */
    private fun reports(c: JsonObject): Pair<JsonObject, JsonObject> {
        val first = flat(c["confirm"].asJsonObject)
        val app = c["appInput"].asJsonObject
        val list = app["listOrder"]?.let { flat(it.asJsonObject) }
        val photo = app["photo"]?.let { gson.fromJson(it, PickerDetailFromImage::class.java) }
        val detail = c["detail"].asJsonObject
        val second = first.copy(pickup = detail["pickup"].asString, dropoff = detail["dropoff"].asString, fare = detail["fare"].asInt)
        val toJson = { o: Any -> gson.toJsonTree(o).asJsonObject.apply { remove("id") } }
        return toJson(KakaoPickerBaseCall.of(first, list, photo, detail["rawText"].asString.takeIf { app["sameText"]?.asBoolean == true })) to toJson(KakaoPickerBaseCall.of(second, list, photo, detail["rawText"].asString))
    }

    @Test fun `같은 입력은 문제지의 기본 콜이 된다`() {
        for (c in cases) {
            val (first, second) = reports(c)
            val want = c["expectBaseCall"].asJsonObject
            assertEquals(c["why"].asString, want["confirm"], first)
            assertEquals(c["why"].asString, want["detail"], second)
        }
    }

    @Test fun `보고 전체 — 번호 · 목록 동 · 사진 기록이 한 요청에 실린다`() {
        val list = SimplifiedOfficeOrder(id = "c", pickup = "광주 경안", dropoff = "강남 역삼1", fare = 1000, timestamp = "t")
        val full = list.copy(pickup = "경기 광주시 경안동", dropoff = "서울 강남구 역삼1동")
        val part = BaseCallReport.partOf(full.copy(id = "보낼번호"), "kakaopicker", "상세 글", screen = "newCall", read = "photo") { KakaoPickerBaseCall.of(full, list, null, "상세 글") }
        val body = gson.toJsonTree(DispatchDetailedRequest(deviceId = "d", report = ReportEnvelope(type = "MANUAL_CLICK", rawText = "상세 글", timestamp = "t"),
            capturedAt = "t", baseCall = part.baseCall, evidence = part.evidence)).asJsonObject
        assertEquals("보낼번호", body["baseCall"].asJsonObject["id"].asString)
        assertEquals("광주 경안", body["baseCall"].asJsonObject["route"].asJsonObject["listRegion"].asJsonObject["pickup"].asString)
        val seen = body["evidence"].asJsonObject["seen"].asJsonArray[0].asJsonObject
        assertEquals("newCall", seen["screen"].asString)
        assertEquals("photo", seen["read"].asString)
        assertEquals("상세 글", seen["rawText"].asString)
    }

    @Test fun `목록 콜이 바뀌면 앞 콜 사진이 남지 않는다`() {
        val session = SessionManager()
        session.lastPhotoDetail = "앞 콜 사진"
        session.listOrder = null
        assertNull(session.lastPhotoDetail)
    }

    @Test fun `손 상세는 사진으로 찾은 목록 줄과 사진 값이 함께 남는다`() {
        val row = SimplifiedOfficeOrder(id = "c", pickup = "광주 경안", dropoff = "강남 역삼1", fare = 1000, timestamp = "t")
        val session = SessionManager()
        session.holdPhotoDetail("사진", row)
        assertEquals(row, session.listOrder)
        assertEquals("사진", session.lastPhotoDetail)
    }

    @Test fun `앱이 연 콜은 누른 목록 줄을 사진 대조로 바꾸지 않는다`() {
        val tapped = SimplifiedOfficeOrder(id = "c", pickup = "광주 경안", dropoff = "강남 역삼1", fare = 1000, timestamp = "t")
        val session = SessionManager().apply { openedByApp = true; listOrder = tapped }
        session.holdPhotoDetail("사진", null)
        assertEquals(tapped, session.listOrder)
        assertEquals("사진", session.lastPhotoDetail)
    }

    @Test fun `시각은 약속 글자 칸이 아니라 «까지» 칸에 담는다`() {
        val order = SimplifiedOfficeOrder(id = "c", pickup = "a", dropoff = "b", fare = 1000, timestamp = "t")
        val time = KakaoPickerBaseCall.of(order, null, null, "경기 성남시 수정구 신촌동 픽업 18.9km\n15:00까지 픽업\n서울 광진구 자양2동 배송 9.7km\n18:28까지 배송").time
        assertEquals("15:00", time.pickup?.by)
        assertEquals("18:28", time.dropoff?.by)
        assertNull(time.dropoff?.text)
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
