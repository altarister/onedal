package com.onedal.app.core

import com.google.gson.JsonObject
import com.google.gson.JsonParser
import com.onedal.app.plugins.hwamul24.Hwamul24Pages
import com.onedal.app.plugins.insung.InsungPages
import com.onedal.app.plugins.kakaopicker.KakaoPickerPages
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * 🔗 **짝 — 원달앱 화면 정의 세 벌과 shared 배차망 정의 표가 같다** (reviews/34 2단계 · 기사님 «플러그인스에 있는 값을 서버가 같이 써야»).
 * 원천은 `onedal-web/shared/src/networkPages.ts` 한 장이고, 원달앱 `…Pages.kt` 셋은 `pnpm gen:pages` 가 뽑은 생성 파일이다.
 * 표를 고치고 안 뽑으면(또는 Pages.kt 를 손으로 고치면) 여기서 빨갛다 — 칸 · 자리 글 · 견본 · 본 곳 · 읽나 · 읽는 곳 · 읽는 법까지 견준다.
 */
class NetworkPagesPairTest {
    private val table: JsonObject by lazy {
        val ts = File("../../onedal-web/shared/src/networkPages.ts").readText()
        val body = Regex("""/\*JSON\*/([\s\S]*?)/\*JSON\*/""").find(ts)?.groupValues?.get(1)
            ?: error("networkPages.ts 에서 /*JSON*/ 표시 사이를 못 찾았다")
        JsonParser.parseString(body).asJsonObject
    }

    private fun rowsOf(pages: PageSpecs): List<List<String?>> =
        Page.values().filter { it in pages }.flatMap { page ->
            pages.getValue(page).map { f -> listOf(page.word, f.field.word, f.where, f.sample, f.seen.name, f.handling.name, f.usedAt, f.read?.pattern, f.part) }
        }

    private fun rowsOf(network: String): List<List<String?>> {
        val pages = table[network].asJsonObject["pages"].asJsonObject
        return pages.entrySet().flatMap { (page, rows) ->
            rows.asJsonArray.map { it.asJsonObject }.map { r ->
                fun s(k: String) = r[k]?.takeIf { !it.isJsonNull }?.asString
                listOf(page, s("field"), s("where"), s("sample"), s("seen"), s("handling"), s("usedAt") ?: "", s("read"), s("part") ?: "")
            }
        }
    }

    @Test fun `인성 화면 정의는 표와 같다`() = assertEquals(rowsOf("insung"), rowsOf(InsungPages.pages))
    @Test fun `화물24시 화면 정의는 표와 같다`() = assertEquals(rowsOf("hwamul24"), rowsOf(Hwamul24Pages.pages))
    @Test fun `카카오 픽커 화면 정의는 표와 같다`() = assertEquals(rowsOf("kakaopicker"), rowsOf(KakaoPickerPages.pages))

    /** 🚚 차종 낱말 → 우리 차종 — 표의 vehicleWords 와 생성 파일의 vehicleWords 가 같다(없으면 둘 다 빈 지도) */
    private fun wordsOf(network: String): Map<String, String?> =
        table[network].asJsonObject["vehicleWords"]?.asJsonArray?.associate { w ->
            w.asJsonObject["word"].asString to w.asJsonObject["vehicle"].takeIf { !it.isJsonNull }?.asString
        } ?: emptyMap()

    @Test fun `인성 차종 낱말은 표와 같다`() = assertEquals(wordsOf("insung"), InsungPages.vehicleWords)
    @Test fun `화물24시 차종 낱말은 표와 같다`() = assertEquals(wordsOf("hwamul24"), Hwamul24Pages.vehicleWords)
    @Test fun `카카오 픽커 차종 낱말은 표와 같다`() = assertEquals(wordsOf("kakaopicker"), KakaoPickerPages.vehicleWords)

    /** 🖥️ 페이지 목록 — 표의 screens 와 생성 파일 screens 를 같은 글 모양으로 펴서 견준다(차례가 판별 차례라 차례까지) */
    private fun matchText(m: ScreenMatch): String =
        "all=${m.all} any=${m.any} none=${m.none} shape=${m.shape?.pattern} min=${m.shapeMin} max=${m.shapeMax}"

    private fun screensOf(screens: List<ScreenSpec>): List<String> = screens.flatMap { s ->
        listOf("${s.name}|${s.standard?.name}|${s.match.map(::matchText)}|${s.listReturn}|${s.seen.name}|${s.evidence}|${s.toCollect}|${s.wordsFrom}") +
            s.overlays.map { o -> "  ${o.name}|${o.kind.name}|${o.match.map(::matchText)}|${o.meaning}|${o.seen.name}|${o.evidence}|${o.toCollect}|${o.wordsFrom}|${o.reportAs?.name ?: ""}" }
    }

    private fun strings(o: JsonObject, k: String): List<String> = o[k]?.asJsonArray?.map { it.asString } ?: emptyList()
    private fun str(o: JsonObject, k: String): String = o[k]?.takeIf { !it.isJsonNull }?.asString ?: ""
    private fun matchesOf(o: JsonObject): List<String> = o["match"].asJsonArray.map { it.asJsonObject }.map { m ->
        val shape = m["shape"]?.asJsonObject
        matchText(ScreenMatch(strings(m, "all"), strings(m, "any"), strings(m, "none"), shape?.get("read")?.asString?.let(::Regex),
            shape?.get("min")?.asInt, shape?.get("max")?.asInt))
    }

    private fun screensOf(network: String): List<String> = table[network].asJsonObject["screens"].asJsonArray.map { it.asJsonObject }.flatMap { s ->
        val standard = s["standard"].takeIf { !it.isJsonNull }?.asString
        listOf("${str(s, "name")}|$standard|${matchesOf(s)}|${s["listReturn"].asBoolean}|${str(s, "seen")}|${strings(s, "evidence")}|${str(s, "toCollect")}|${str(s, "wordsFrom")}") +
            s["overlays"].asJsonArray.map { it.asJsonObject }.map { o ->
                "  ${str(o, "name")}|${str(o, "kind")}|${matchesOf(o)}|${str(o, "meaning")}|${str(o, "seen")}|${strings(o, "evidence")}|${str(o, "toCollect")}|${str(o, "wordsFrom")}|${str(o, "reportAs")}"
            }
    }

    @Test fun `인성 페이지 목록은 표와 같다`() = assertEquals(screensOf("insung"), screensOf(InsungPages.screens))
    @Test fun `화물24시 페이지 목록은 표와 같다`() = assertEquals(screensOf("hwamul24"), screensOf(Hwamul24Pages.screens))
    @Test fun `카카오 픽커 페이지 목록은 표와 같다`() = assertEquals(screensOf("kakaopicker"), screensOf(KakaoPickerPages.screens))

    /** 🧭 배차망을 가르는 글자 묶음 — 표의 networkMarkers 와 생성 파일이 같다 */
    private fun markersOf(network: String): List<List<String>> =
        table[network].asJsonObject["networkMarkers"].asJsonArray.map { g -> g.asJsonArray.map { it.asString } }

    @Test fun `배차망 가르는 글자 묶음은 표와 같다`() {
        assertEquals(markersOf("insung"), InsungPages.networkMarkers)
        assertEquals(markersOf("hwamul24"), Hwamul24Pages.networkMarkers)
        assertEquals(markersOf("kakaopicker"), KakaoPickerPages.networkMarkers)
    }

    /** 🧭 우리 기준 페이지 이름 · 차례 — shared STANDARD_SCREENS 와 core/PageSpec.kt StandardScreen 이 같다 */
    @Test fun `우리 기준 페이지 이름은 shared 와 같다`() {
        val ts = File("../../onedal-web/shared/src/networkPages.ts").readText()
        val block = Regex("""STANDARD_SCREENS = \[([\s\S]*?)\] as const""").find(ts)?.groupValues?.get(1)
            ?: error("networkPages.ts 에서 STANDARD_SCREENS 를 못 찾았다")
        assertEquals(Regex("""'(\w+)'""").findAll(block).map { it.groupValues[1] }.toList(), StandardScreen.values().map { it.name })
    }

    @Test fun `세 Pages_kt 는 생성 파일이다 - 손으로 고치지 않는다`() {
        for (p in listOf("insung/InsungPages.kt", "hwamul24/Hwamul24Pages.kt", "kakaopicker/KakaoPickerPages.kt")) {
            assertTrue("$p 가 생성 파일 머리를 안 단다 — cd onedal-web && pnpm gen:pages",
                File("src/main/java/com/onedal/app/plugins/$p").readText().contains("생성 파일이다 — 손으로 고치지 않는다"))
        }
    }
}
