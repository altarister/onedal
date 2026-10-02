package com.onedal.app.plugins.hwamul24

import android.content.ContextWrapper
import com.google.gson.JsonParser
import org.junit.Assert.assertEquals
import org.junit.Test
import java.io.File

/**
 * 🔇 **화물24시 잡음 낱말 — 서버 파일 `keywords_24.json` 과 파서 기본값은 짝이다** (reviews/35 5단계).
 *
 * 원달앱은 서버 사전(`GET /api/config/keywords?app=24시`)을 받아 쓰되, 못 받으면 파서 기본값(`NOISE_WORDS`)으로 돈다.
 * 🔴 `keywords_24.json` 에는 인성 낱말이 일부러 남아 있다 — 사전은 부팅 때 배차망 하나 몫만 받고 갈아타도 다시 안 받아,
 *    화물24시로 부팅한 뒤 인성으로 넘어가면 인성 파서가 이 파일을 읽는다. 그래서 «같다»가 아니라 «기본값을 다 담는다»를 본다.
 */
class Hwamul24NoiseWordsTest {
    private val parser = Hwamul24Parser(ContextWrapper(null))

    private fun serverWords(file: String): Set<String> =
        JsonParser.parseString(File("../../onedal-web/server/config/$file").readText()).asJsonObject["uiNoiseWords"].asJsonArray.map { it.asString }.toSet()

    /** 파서 소스의 `val NOISE_WORDS = setOf(…)` 낱말 */
    private fun parserDefaultWords(): Set<String> {
        val src = File("src/main/java/com/onedal/app/plugins/hwamul24/Hwamul24Parser.kt").readText()
        val start = src.indexOf("val NOISE_WORDS = setOf(")
        if (start < 0) return emptySet()
        val body = src.substring(start, src.indexOf(")\n", start))
        return Regex("\"([^\"]+)\"").findAll(body.substringAfter("setOf(")).map { it.groupValues[1] }.toSet()
    }

    /** 견본 — shared 화면 문제지의 화물24시 줄 · 시뮬레이터 화면 스냅숏의 화물24시 줄(띄어쓰기로 쪼갬) · 이 폴더 검사의 노드 목록 */
    private fun samples(): List<Pair<String, List<String>>> {
        val cases = JsonParser.parseString(File("../../onedal-web/shared/src/screenCases.json").readText()).asJsonObject["cases"].asJsonArray
            .map { it.asJsonObject }.filter { it["network"].asString == "hwamul24" }
            .map { "문제지 " + it["why"].asString to it["text"].asString.split(" ").filter { w -> w.isNotEmpty() } }
        val snap = File("../../onedal-sim/tests/__snapshots__/screens.test.tsx.snap").readLines()
            .filter { it.startsWith("exports[") && it.contains("화물24시") }
            .map { line -> "시뮬 " + line.substringAfter("> ").substringBefore("`]") to line.substringAfter("= `\"").substringBeforeLast("\"`").split(" ").filter { w -> w.isNotEmpty() } }
        val tests = File("src/test/java/com/onedal/app/plugins/hwamul24").listFiles()!!.filter { it.name != "Hwamul24NoiseWordsTest.kt" }.sortedBy { it.name }.flatMap { f ->
            val src = f.readText()
            val nodeLists = Regex("""(?:parse|listOf)\(((?:"[^"]*"\s*,\s*)+"[^"]*")""").findAll(src).map { m ->
                Regex("\"([^\"]*)\"").findAll(m.groupValues[1]).map { it.groupValues[1] }.toList()
            }
            val joined = Regex("""(?:sim|parse)\("([^"]*, [^"]*)"""").findAll(src).map { it.groupValues[1].split(", ") }
            (nodeLists + joined).filter { it.size >= 3 }.map { "검사 ${f.name}" to it }.toList()
        }
        return cases + snap + tests
    }

    /** 콜 칸만 — 매번 바뀌는 id · 시각은 뺀다 */
    private fun callFields(texts: List<String>, words: Set<String>): String = parser.parseWith(texts, words).copy(id = "", timestamp = "").toString()

    @Test fun `견본이 있다 - 문제지 · 시뮬 · 검사 셋 다`() {
        val names = samples().map { it.first.substringBefore(' ') }.toSet()
        assertEquals(setOf("문제지", "시뮬", "검사"), names)
    }

    @Test fun `사전을 못 받았으면 기본값 - 받기 전 parse 는 기본값으로 읽는다`() {
        assertEquals(Hwamul24Parser.NOISE_WORDS, Hwamul24Parser.noiseWordsOf(null))
        assertEquals(Hwamul24Parser.NOISE_WORDS, Hwamul24Parser.noiseWordsOf("{}"))
        assertEquals(Hwamul24Parser.NOISE_WORDS, Hwamul24Parser.noiseWordsOf("깨진 글"))
        samples().forEach { (name, texts) ->
            assertEquals(name, callFields(texts, Hwamul24Parser.NOISE_WORDS), parser.parse(texts).copy(id = "", timestamp = "").toString())
        }
    }

    /**
     * 🔴 받아 둔 사전은 하나뿐이다(`targetAppKeywords` — 부팅 때 그 배차망 것) — 인성 · 픽커 사전을 받아 둔 채 화물24시로 넘어와도,
     * 서버가 아직 화물24시 낱말로 바뀌기 전이어도(인성 사본) 콜 칸이 기본값으로 읽은 것과 같아야 한다.
     */
    @Test fun `어느 서버 사전을 받아 두었어도 견본의 콜 칸은 기본값으로 읽은 것과 같다`() {
        for (file in listOf("keywords_24.json", "keywords_inseong.json", "keywords_picker.json")) {
            val words = Hwamul24Parser.noiseWordsOf(File("../../onedal-web/server/config/$file").readText())
            val diff = samples().filter { (_, t) -> callFields(t, words) != callFields(t, Hwamul24Parser.NOISE_WORDS) }.map { it.first }
            assertEquals("$file 사전으로 콜 칸이 바뀐 견본\n" + diff.joinToString("\n"), 0, diff.size)
        }
    }

    @Test fun `서버 keywords_24 의 잡음 낱말은 파서 기본값을 다 담는다`() {
        val defaults = parserDefaultWords()
        assertEquals(Hwamul24Parser.NOISE_WORDS, defaults)
        assertEquals("서버 사전에 없는 기본값", emptySet<String>(), defaults - serverWords("keywords_24.json"))
    }
}
