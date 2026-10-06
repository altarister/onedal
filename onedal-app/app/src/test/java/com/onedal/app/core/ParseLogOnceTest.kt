package com.onedal.app.core

import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * 🔕 **목록 읽기(`parse`) 안의 로그는 같은 콜이면 한 번만 찍는다** — `parse` 는 목록을 읽을 때마다 · 상세 대조 때도 콜마다 돈다.
 *    `LogOnce` 없이 찍으면 1초마다 같은 줄이 콜 수만큼 쌓여 원달앱 로그 파일 상한(64MB)을 앞당긴다.
 *    규칙: 세 배차망 파서의 `parse` 본문 안 `AppLogger.d(` · `AppLogger.i(` 는 바로 위 `LogOnce.changed(` 문 안에 있다.
 *    W · E 는 드문 일이라 대상이 아니다.
 */
class ParseLogOnceTest {

    private val root = "src/main/java/com/onedal/app/plugins"
    private val parsers = listOf("insung/InsungParser.kt", "hwamul24/Hwamul24Parser.kt", "kakaopicker/KakaoPickerParser.kt")

    /** `header` 로 시작하는 함수의 본문 — 첫 `{` 부터 짝이 맞는 `}` 까지 */
    private fun bodyOf(src: String, header: String): String? {
        val at = src.indexOf(header).takeIf { it >= 0 } ?: return null
        val open = src.indexOf('{', at)
        var depth = 0
        for (i in open until src.length) {
            when (src[i]) {
                '{' -> depth++
                '}' -> if (--depth == 0) return src.substring(open, i + 1)
            }
        }
        return null
    }

    @Test fun `세 파서의 parse 안 d · i 로그는 LogOnce 안에 있다`() {
        var seen = 0
        for (p in parsers) {
            val src = File("$root/$p").readText()
            val body = bodyOf(src, "internal fun parseWith(") ?: bodyOf(src, "override fun parse(texts: List<String>): SimplifiedOfficeOrder {")
            assertTrue("$p 의 parse 본문을 못 찾았다", body != null)
            for (m in Regex("""AppLogger\.[di]\(""").findAll(body!!)) {
                seen++
                val before = body.substring(maxOf(0, m.range.first - 160), m.range.first)
                assertTrue("$p — parse 안 로그가 LogOnce 밖이다: ${body.substring(m.range.first, minOf(body.length, m.range.first + 60))}",
                    before.contains("LogOnce.changed("))
            }
        }
        assertTrue("parse 안 로그를 하나도 못 봤다 — 규칙이 빈 손으로 돈다", seen > 0)
    }
}
