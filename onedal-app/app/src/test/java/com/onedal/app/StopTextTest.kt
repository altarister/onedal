package com.onedal.app

import com.onedal.app.core.BadgeWord
import com.onedal.app.core.LocationTextAnalyzer
import com.onedal.app.core.StopText
import com.onedal.app.models.CallStop
import com.onedal.app.plugins.hwamul24.Hwamul24Pages
import com.onedal.app.plugins.insung.InsungPages
import com.onedal.app.plugins.isflex.IsflexPages
import com.onedal.app.plugins.kakaopicker.KakaoPickerPages
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * 📍 **원달앱 판정 글자 짝 · 칸 앞 토막** — 공통 문제지 `pageReadCases.json` `stopQueryCases` 를 shared `stopQueryOf` 와 같은 답으로 푼다.
 * 문제지 정거장 그대로 한 번, 원달앱이 실제로 보내는 꼴(칸 원문 + 칸 앞 토막이 낸 약속 원문)로 한 번 — 서버는 그 꼴을 받아 같은 규칙으로 다듬는다.
 * 못 잡는 것: 실제 카카오 좌표 · 인성 지역 칸 고르기(1차 · 2차 규칙은 그대로).
 */
class StopTextTest {
    private data class Case(val network: String, val stop: CallStop, val expect: String, val why: String)

    private val cases: List<Case> = com.google.gson.JsonParser.parseString(File("../../onedal-web/shared/src/network/pageReadCases.json").readText())
        .asJsonObject["stopQueryCases"].asJsonArray.map { it.asJsonObject }
        .filter { !it["expect"].isJsonNull }
        .map { c ->
            val s = c["stop"].asJsonObject
            fun text(k: String) = s[k]?.takeIf { !it.isJsonNull }?.asString
            Case(c["network"].asString, CallStop(listText = text("listText"), addressDetail = text("addressDetail"),
                promiseText = text("promiseText"), customerName = text("customerName")), c["expect"].asString, c["why"].asString)
        }

    private val badgesOf: Map<String, List<BadgeWord>> = mapOf("insung" to InsungPages.badgeWords, "hwamul24" to Hwamul24Pages.badgeWords,
        "kakaopicker" to KakaoPickerPages.badgeWords, "isflex" to IsflexPages.badgeWords)

    @Test fun `공통 문제지 - 정거장 그대로 shared 와 같은 답`() {
        assertTrue("문제지가 비었다", cases.size > 270)
        val wrong = cases.filter { StopText.query(it.network, it.stop) != it.expect }
            .map { "${it.network} ${it.stop} → ${StopText.query(it.network, it.stop)} (맞는 답 ${it.expect}) — ${it.why}" }
        assertEquals(wrong.joinToString("\n"), 0, wrong.size)
    }

    @Test fun `공통 문제지 - 원달앱이 보내는 꼴(칸 원문 + 칸 앞 토막의 약속)도 같은 답`() {
        val listOnly = cases.filter { it.stop.addressDetail == null && it.stop.promiseText == null && it.stop.listText != null }
        assertTrue(listOnly.size > 200)
        val wrong = listOnly.mapNotNull { c ->
            val pieces = LocationTextAnalyzer.split(c.stop.listText!!, badgesOf.getValue(c.network))
            val sent = c.stop.copy(promiseText = pieces.promise)
            val got = StopText.query(c.network, sent)
            if (got == c.expect) null else "${c.network} ${c.stop.listText} [약속 ${pieces.promise}] → $got (맞는 답 ${c.expect})"
        }
        assertEquals(wrong.joinToString("\n"), 0, wrong.size)
    }

    @Test fun `칸 앞 토막 - 약속은 제 정거장에 · 조건 토막은 따로 · 앞 «@»`() {
        val insung = InsungPages.badgeWords
        LocationTextAnalyzer.split("@낼8:30/가산동", insung).let { assertTrue(it.mark); assertEquals("낼8:30", it.promise); assertEquals(emptyList<String>(), it.conditions) }
        assertEquals("7시까지", LocationTextAnalyzer.split("내곡동/7시까지", insung).promise)
        assertEquals("14시전", LocationTextAnalyzer.split("14시전/인천송도동", insung).promise)
        assertEquals("낼8", LocationTextAnalyzer.split("낼8/중구봉래동", insung).promise)
        assertEquals("오전1시41", LocationTextAnalyzer.split("오전1시41/곤지암읍", insung).promise)
        assertEquals("낼11-12시", LocationTextAnalyzer.split("@낼11-12시/구", insung).promise)
        assertEquals("낼6시", LocationTextAnalyzer.split("@낼6시(구래동", insung).promise)
        assertEquals("18:30", LocationTextAnalyzer.split("@18:30구로동", insung).promise)
        LocationTextAnalyzer.split("급송/초월읍", insung).let { assertNull(it.promise); assertEquals(listOf("급송"), it.conditions) }
        LocationTextAnalyzer.split("폰)철산동", insung).let { assertNull(it.promise); assertEquals(listOf("폰"), it.conditions) }
        LocationTextAnalyzer.split("풍납동>논현동", insung).let { assertNull(it.promise); assertEquals(listOf(">"), it.conditions) }
        LocationTextAnalyzer.split("김포(대곶면", insung).let { assertNull(it.promise); assertEquals(emptyList<String>(), it.conditions) }
        LocationTextAnalyzer.split("@삼성동/왕복", IsflexPages.badgeWords).let { assertNull(it.promise); assertEquals(listOf("왕복"), it.conditions) }
        assertEquals("예약", LocationTextAnalyzer.split("예약/초월읍", insung).promise)   // «예약»은 조건이 아니라 약속 — 예약 표시를 잃지 않는다
        assertNull("날 · 시각 표시 없는 조각은 약속이 아니다", LocationTextAnalyzer.split("카고,문래동6가", insung).promise)
        assertNull(LocationTextAnalyzer.split("@성남터/전라광주출", IsflexPages.badgeWords).promise)
    }

    @Test fun `정거장 지역 - 읍 · 면 · 동 · 리 · 가로 끝나는 마지막 토막만`() {
        assertEquals("내곡동", StopText.regionOf("isflex", "내곡동/7시까지"))
        assertEquals("이의동", StopText.regionOf("isflex", "@낼08:20/수원이의동"))
        assertEquals("구미동", StopText.regionOf("hwamul24", "경기 성남 구미동"))
        assertEquals("대곶면", StopText.regionOf("insung", "김포(대곶면"))
        assertNull(StopText.regionOf("insung", "강남터미널"))
        assertNull(StopText.regionOf("insung", null))
    }
}
