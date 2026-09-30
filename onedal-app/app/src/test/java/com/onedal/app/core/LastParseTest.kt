package com.onedal.app.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * ♻️ **같은 필터 원문은 한 번만 푼다** (배포 리뷰 낮음 · onedal-1f «가»).
 * 픽커 판정기가 목록 줄마다 필터 원문(~10KB · 내일 상차 목록으로 커짐)을 Gson 으로 2~4번 다시 풀었다.
 * 원문 자체로 가른다 — 버전 글자만 바뀌고 값이 같아도, 값만 바뀌어도 틀리지 않는다.
 */
class LastParseTest {
    @Test fun `같은 원문이면 다시 풀지 않고 · 바뀌면 다시 푼다`() {
        val p = LastParse { raw: String -> raw.length }
        assertEquals(3, p.of("abc")); assertEquals(3, p.of("abc")); assertEquals(3, p.of(String("abc".toCharArray())))
        assertEquals(1, p.parses)
        assertEquals(4, p.of("abcd"))
        assertEquals(2, p.parses)
    }

    @Test fun `픽커 판정기 - 알람 조건과 값 지문이 원문 재사용 · 탭 막대는 같은 노드 목록이면 한 번`() {
        val parser = File("src/main/java/com/onedal/app/plugins/kakaopicker/KakaoPickerParser.kt").readText()
        assertTrue(parser.contains("private val configCache = com.onedal.app.core.LastParse(::alarmConfigOf)"))
        assertTrue(parser.contains("private val valuesKeyCache = com.onedal.app.core.LastParse(::alarmValuesKeyOf)"))
        assertTrue(parser.contains("configCache.of("))
        assertTrue(parser.contains("valuesKeyCache.of("))
        val plugin = File("src/main/java/com/onedal/app/plugins/kakaopicker/KakaoPickerPlugin.kt").readText()
        assertTrue(plugin.contains("if (allNodes === lastTabNodes) return lastTabTop"))
    }
}
