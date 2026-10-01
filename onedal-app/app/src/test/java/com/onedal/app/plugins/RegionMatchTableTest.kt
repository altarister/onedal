package com.onedal.app.plugins

import com.google.gson.JsonParser
import com.onedal.app.plugins.kakaopicker.KakaoPickerParser
import org.junit.Assert.assertEquals
import org.junit.Test
import java.io.File

/**
 * 🏘️ **이름이 같은 다른 지역 동 — 서버와 같은 문제지** (`onedal-web/shared/src/regionMatchCases.json` · 서버 `dongSigungu.test.ts` 가 같은 표를 읽는다).
 * 규칙: 동 바로 앞에 다른 시·군·구가 보이면 거른다 · 목록 페이지에서 상세 주소가 안 보이면 통과.
 * 실물 09-30 14:30:27 — 픽커 목록 «평택 고덕» · 상세 «경기 평택시 고덕동 …» 이 도착목표 «고덕동»(서울 강동구)으로 통과했다.
 */
class RegionMatchTableTest {
    private val table = JsonParser.parseString(File("../../onedal-web/shared/src/regionMatchCases.json").readText()).asJsonObject
    private val dongSigungu: Map<String, List<String>> = table["dongSigungu"].asJsonObject.entrySet()
        .associate { (k, v) -> k to v.asJsonArray.map { it.asString } }
    private val cases = table["cases"].asJsonArray.map { it.asJsonObject }

    private fun label(c: com.google.gson.JsonObject) = "«${c["text"].asString}» ${c["keyword"].asString} — ${c["why"].asString}"

    @Test fun `지역 대조 - 표 전부 (픽커 줄임 토막 줄은 서버처럼 건너뛴다)`() {
        for (c in cases.filter { it["only"]?.asString != "picker" }) {
            assertEquals(label(c), c["expect"].asBoolean,
                RegionMatch.anyHit(c["text"].asString, listOf(c["keyword"].asString), emptyMap(), dongSigungu))
        }
    }

    @Test fun `픽커 도착 판정 - 표 전부 (줄임 토막 대조를 거쳐도 같은 답)`() {
        for (c in cases) {
            assertEquals(label(c), c["expect"].asBoolean,
                KakaoPickerParser.destinationOk(c["text"].asString, listOf(c["keyword"].asString), emptyMap(), emptyList(), dongSigungu))
        }
    }

    /**
     * 🗺️ **시구 별칭이 있어도 같은 답** (행정동 · onedal-69 «가») — 서버는 목적지 시구 꼴(«수정» · «처인»)을 시 별칭(customCityFilters)으로도 싣는다.
     * 픽커 목록 줄은 별칭으로 통과하던 것이 그대로 통과해야 하고(별칭 있음), 서버가 행정동 낱말을 펴 주면 별칭 없이도 통과한다(위 시험).
     */
    @Test fun `픽커 도착 판정 - 행정동 줄은 시구 별칭이 있어도 통과`() {
        for (c in cases.filter { it["only"]?.asString == "picker" && it["expect"].asBoolean }) {
            val aliases = dongSigungu[c["keyword"].asString] ?: emptyList()
            assertEquals(label(c) + " (별칭 있음)", true,
                KakaoPickerParser.destinationOk(c["text"].asString, listOf(c["keyword"].asString), emptyMap(), aliases, dongSigungu))
        }
    }

    @Test fun `칸이 비면 지금과 같다 - 평택 고덕동도 통과`() {
        assertEquals(true, RegionMatch.anyHit("경기 평택시 고덕동 고덕헤리움 101동", listOf("고덕동"), emptyMap()))
        assertEquals(true, KakaoPickerParser.destinationOk("평택 고덕", listOf("고덕동"), emptyMap(), emptyList(), emptyMap()))
    }
}
