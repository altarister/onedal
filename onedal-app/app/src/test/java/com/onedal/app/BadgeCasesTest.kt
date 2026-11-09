package com.onedal.app

import com.onedal.app.core.BadgeMeaning
import com.onedal.app.core.BadgePlace
import com.onedal.app.core.BadgeWord
import com.onedal.app.core.PageFieldRead
import com.onedal.app.core.firstPickupStop
import com.onedal.app.plugins.hwamul24.Hwamul24Pages
import com.onedal.app.plugins.hwamul24.Hwamul24Parser
import com.onedal.app.plugins.insung.InsungPages
import com.onedal.app.plugins.insung.InsungParser
import com.onedal.app.plugins.isflex.IsflexPages
import com.onedal.app.plugins.isflex.IsflexParser
import com.onedal.app.plugins.kakaopicker.KakaoPickerPages
import com.onedal.app.plugins.kakaopicker.KakaoPickerParser
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File
import java.time.LocalDateTime

/**
 * 🏷️ **원달앱 표시 글자 짝** — 공통 문제지 `pageReadCases.json` 의 `badgeCases`(글자 → 뜻 갈래 · 값) · `badgeValueCases`(목록 꼬리표 줄 · 칸 앞 토막 → 구분 · 형태 값)를
 * shared `badgeOf` · `badgeValueAmong` 과 같은 답으로 풀고, 네 배차망 목록 읽기가 그 답으로 구분 · 형태 칸을 채우는지 본다.
 * 못 잡는 것: 실물 화면 글자 꼴(문제지 · 견본 노드만) · 서버가 상세에서 다시 정하는 구분 · 형태(서버 jest 몫).
 */
class BadgeCasesTest {
    private val sheet = com.google.gson.JsonParser.parseString(File("../../onedal-web/shared/src/network/pageReadCases.json").readText()).asJsonObject

    private val badgesOf: Map<String, List<BadgeWord>> = mapOf("insung" to InsungPages.badgeWords, "hwamul24" to Hwamul24Pages.badgeWords,
        "kakaopicker" to KakaoPickerPages.badgeWords, "isflex" to IsflexPages.badgeWords)

    private fun placeOf(word: String) = BadgePlace.entries.first { it.word == word }
    private fun meaningOf(word: String) = BadgeMeaning.entries.first { it.word == word }
    private fun textOrNull(e: com.google.gson.JsonElement?) = e?.takeIf { !it.isJsonNull }?.asString

    @Test fun `공통 문제지 badgeCases - 글자 → 뜻 갈래 · 값이 shared 와 같은 답`() {
        val cases = sheet["badgeCases"].asJsonArray.map { it.asJsonObject }
        assertTrue("문제지가 비었다", cases.size > 60)
        val wrong = cases.mapNotNull { c ->
            val found = PageFieldRead.badgeOf(badgesOf.getValue(c["network"].asString), placeOf(c["at"].asString), c["text"].asString)
            val got = listOf(found?.meaning?.word, found?.value)
            val want = listOf(textOrNull(c["meaning"]), textOrNull(c["value"]))
            if (got == want) null else "${c["network"].asString} ${c["at"].asString} «${c["text"].asString}» → $got (맞는 답 $want) — ${c["why"].asString}"
        }
        assertEquals(wrong.joinToString("\n"), 0, wrong.size)
    }

    @Test fun `공통 문제지 badgeValueCases - 목록 꼬리표 줄 · 칸 앞 토막의 구분 · 형태 값이 shared 와 같은 답 · 표에 없는 낱말로 모름을 내지 않는다`() {
        val cases = sheet["badgeValueCases"].asJsonArray.map { it.asJsonObject }
        assertTrue("문제지가 비었다", cases.size >= 10)
        val wrong = cases.mapNotNull { c ->
            val words = c["words"].asJsonArray.map { it.asJsonObject }.map { placeOf(it["at"].asString) to it["text"].asString }
            val got = PageFieldRead.badgeValueAmong(badgesOf.getValue(c["network"].asString), meaningOf(c["meaning"].asString), words)
            val want = textOrNull(c["expect"])
            if (got == want) null else "${c["network"].asString} ${c["meaning"].asString} $words → $got (맞는 답 $want) — ${c["why"].asString}"
        }
        assertEquals(wrong.joinToString("\n"), 0, wrong.size)
    }

    /** 🔴 화물24시 «수 · 지 · 독차 · 왕복» 배지는 버리지 않고 화면 기록에 — «왕복»은 구분 칸 · 지역 후보에서는 그대로 빠진다 */
    @Test fun `화물24시 목록 - 독차 · 수 · 왕복은 화면 기록에 · 왕복은 구분 · 상차 · 하차 칸은 그대로`() {
        val o = Hwamul24Parser(android.content.ContextWrapper(null)).parseWith(
            "경기 광주 곤지암읍, ›, 서울 마포구 상암동, 당상, 수, 5, Km, 12:20, 지, 당착, 다마스/전체마대 1개, 독차, 왕복, 계산서, 61,000, 원".split(", "),
            Hwamul24Parser.NOISE_WORDS)
        assertEquals("당상 수 지 당착 독차 왕복", o.tagsText)
        assertEquals("왕복", o.tripType)
        assertNull(o.orderForm)
        assertEquals("경기 광주 곤지암읍", firstPickupStop(o)?.listText)
        assertEquals("서울 마포구 상암동", com.onedal.app.core.lastDropoffStop(o)?.listText)
    }

    /** 🔴 인성 목록 도착지 «왕복/» → 구분 왕복 · «>» → 경유 · 출발지 «급송/»(시뮬레이터 그림)은 표에 상차지 줄이 없어 빈칸 */
    @Test fun `인성 목록 - 왕복 · 두 곳 하차는 구분 · 급송 앞글자는 빈칸`() {
        val parser = InsungParser(android.content.ContextWrapper(null))
        assertEquals("왕복", parser.parse(listOf("2.6", "20.4", "@가산동", "왕복/낼7시/송파", "다", "34.6")).tripType)
        assertEquals("경유", parser.parse(listOf("2.6", "20.4", "@가산동", "풍납동>논현동", "다", "34.6")).tripType)
        parser.parse(listOf("2.6", "20.4", "@급송/초월읍", "곤지암읍", "다", "34.6")).let { assertNull(it.orderForm); assertNull(it.tripType) }
    }

    /** 🔴 플렉스 목록 꼬리표 «급» · 앞글자 «급송/» → 형태 급송 · 출발지 «왕복» → 구분 왕복 · «과적»은 빈칸 */
    @Test fun `플렉스 목록 - 급 · 급송 앞글자는 형태 급송 · 과적은 빈칸`() {
        val now = LocalDateTime.of(2030, 1, 1, 10, 0)
        IsflexParser.parseList(listOf("1.2", "다마스", "급", "@급송/서초동", "약 4.9km", "역삼동", "10,626", "착불"), IsflexParser.NOISE_WORDS, now).let {
            assertEquals("급송", it.orderForm); assertNull(it.tripType)
        }
        IsflexParser.parseList(listOf("1.2", "다마스", "과적", "@삼성동/왕복", "약 4.9km", "역삼동", "10,626", "착불"), IsflexParser.NOISE_WORDS, now).let {
            assertEquals("왕복", it.tripType); assertNull(it.orderForm)
        }
    }

    /** 🔴 픽커 목록 꼬리표 «급송» → 형태 급송 · 시각 · «준비 N분» 이 섞여도 구분은 «모름»이 아니라 빈칸 */
    @Test fun `픽커 목록 - 급송은 형태 급송 · 다른 꼬리표는 빈칸`() {
        val parser = KakaoPickerParser(null)
        parser.parse(listOf("퀵", "급송", "승", "예약", "18:30", "용산", "4.7km", "광주", "경안", "한남", "16,093")).let {
            assertEquals("급송", it.orderForm); assertNull(it.tripType)
        }
        parser.parse(listOf("퀵", "소형", "강남", "6.8km", "광주", "송정", "역삼1", "19,404")).let { assertNull(it.orderForm); assertNull(it.tripType) }
    }
}
