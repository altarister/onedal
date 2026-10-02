package com.onedal.app.core

import com.google.gson.JsonParser
import com.onedal.app.core.engine.ScreenDetector
import com.onedal.app.plugins.IDispatchAppPlugin
import com.onedal.app.plugins.hwamul24.Hwamul24Plugin
import com.onedal.app.plugins.insung.InsungPlugin
import com.onedal.app.plugins.kakaopicker.KakaoPickerPlugin
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * 🧪 **화면 판별은 배차망 정의 표대로** (reviews/35 2단계).
 * 문제지 `onedal-web/shared/src/screenCases.json` — 실물 캡처 고정 글자 · 시뮬레이터 견본 · A24 폰이 올린 화면 원문.
 * 줄마다 `expect`(표 판별)와 같아야 한다. `was`(옛 판별)와 다른 줄이 2단계에서 바뀌는 화면 전부다 — 그 밖은 0.
 */
class ScreenTableDetectTest {
    private data class Case(val network: String, val why: String, val text: String, val was: String, val expect: String)

    private val cases: List<Case> by lazy {
        val json = JsonParser.parseString(File("../../onedal-web/shared/src/screenCases.json").readText()).asJsonObject
        json["cases"].asJsonArray.map { it.asJsonObject }.map {
            Case(it["network"].asString, it["why"].asString, it["text"].asString, it["was"].asString, it["expect"].asString)
        }
    }

    private val plugins: Map<String, IDispatchAppPlugin> =
        mapOf("insung" to InsungPlugin(), "hwamul24" to Hwamul24Plugin(), "kakaopicker" to KakaoPickerPlugin())

    /** 원달앱이 이 화면을 무엇으로 보나 — 건너뛰는 화면(로딩 · 자동터치 동의)은 «SKIP» */
    private fun classify(network: String, text: String): String {
        val read = ScreenDetector().detect(text, plugins.getValue(network).screens)
        return if (read.skip) "SKIP" else read.context.name
    }

    @Test fun `문제지가 있다 - 세 배차망 · 바뀌는 줄과 안 바뀌는 줄`() {
        assertEquals(setOf("insung", "hwamul24", "kakaopicker"), cases.map { it.network }.toSet())
        assertTrue(cases.any { it.was != it.expect })
        assertTrue(cases.count { it.was == it.expect } > 100)
    }

    @Test fun `모든 줄이 표 판별대로 읽힌다`() {
        val wrong = cases.mapNotNull { c ->
            val got = classify(c.network, c.text)
            if (got == c.expect) null else "${c.network} ${c.why} — 기대 ${c.expect} · 지금 $got (옛 ${c.was}) · ${c.text.take(80)}"
        }
        assertEquals("표 판별과 다른 줄 ${wrong.size}\n" + wrong.joinToString("\n"), 0, wrong.size)
    }
}
