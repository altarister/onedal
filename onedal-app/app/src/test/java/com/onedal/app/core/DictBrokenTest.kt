package com.onedal.app.core

import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File
import java.time.LocalDate

/**
 * 📕 **낱말 사전이 깨지면 운영센터 이상 기록에 하루 한 번** (`DictBroken`) — 파서는 기본값으로 계속 거르고 기록만 는다.
 *    단위 검사의 안드로이드 JSON 은 빈 껍데기라 깨진 글자로 예외를 못 낸다 → 하루 한 번 셈은 날짜를 넣어 직접 보고,
 *    세 파서의 사전 catch 가 기록을 부르는지는 글자로 본다.
 */
class DictBrokenTest {
    private val got = mutableListOf<Pair<String, String>>()

    private fun hook() { DictBroken.sink = { n, why -> got += n to why } }
    @After fun unhook() { DictBroken.sink = null }

    @Test fun `같은 날 같은 배차망은 한 번만 올린다 · 까닭 글을 싣는다`() {
        hook()
        val day = LocalDate.of(2001, 1, 1)   // 검사마다 다른 날 — 날이 바뀌면 셈이 비워진다
        assertTrue(DictBroken.record("24시", IllegalStateException("깨짐"), day))
        assertFalse(DictBroken.record("24시", IllegalStateException("깨짐"), day))
        assertEquals(listOf("24시" to "IllegalStateException: 깨짐"), got)
    }

    @Test fun `배차망이 다르면 따로 · 날이 바뀌면 다시 한 번`() {
        hook()
        val day = LocalDate.of(2002, 1, 1)
        DictBroken.record("인성콜", RuntimeException("a"), day)
        DictBroken.record("픽커", RuntimeException("a"), day)
        DictBroken.record("인성콜", RuntimeException("a"), day.plusDays(1))
        assertEquals(listOf("인성콜", "픽커", "인성콜"), got.map { it.first })
    }

    @Test fun `세 파서의 사전 catch 가 기록을 부른다`() {
        val root = "src/main/java/com/onedal/app/plugins"
        val reads = mapOf(
            "insung/InsungParser.kt" to "Prefs.TARGET_APP_KEYWORDS, null)",
            "kakaopicker/KakaoPickerParser.kt" to "Prefs.TARGET_APP_KEYWORDS, null)",
            "hwamul24/Hwamul24Parser.kt" to "fun noiseWordsOf(",
        )
        for ((p, mark) in reads) {
            val src = File("$root/$p").readText()
            val at = src.indexOf(mark)
            assertTrue("$p 사전 읽기를 못 찾았다", at >= 0)
            val catchAt = src.indexOf("catch", at)
            assertTrue("$p — 사전 catch 가 DictBroken 을 안 부른다", src.substring(catchAt, catchAt + 200).contains("DictBroken.record("))
        }
    }
}
