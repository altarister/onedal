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

    /**
     * 📡 **서버로 보내는 값은 페이지 값** (reviews/35 5단계) — 원달앱 안 값의 팝업(POPUP_*)은 상세(DETAIL_*)로 · 목록 복귀 내 오더(LIST_COMPLETED)는 MY_ORDERS 로.
     * 그 밖은 안 값과 같다 · 표가 아는 화면이면 페이지 이름이 실린다.
     */
    @Test fun `보내는 값은 페이지 값 - 팝업은 상세 · 목록 복귀 내 오더는 MY_ORDERS`() {
        val wrong = cases.mapNotNull { c ->
            val r = ScreenDetector().detect(c.text, plugins.getValue(c.network).screens)
            if (r.skip) return@mapNotNull null
            val want = when (r.context.name) {
                "POPUP_PICKUP", "POPUP_DROPOFF", "POPUP_MEMO", "POPUP_ERROR" -> setOf("DETAIL_PRE_CONFIRM", "DETAIL_CONFIRMED")
                "LIST_COMPLETED" -> setOf("MY_ORDERS")
                else -> setOf(r.context.name)
            }
            val pageOk = r.context.name == "UNKNOWN" || r.page != null
            if (r.wire.name in want && pageOk) null else "${c.network} ${c.why} — 안 ${r.context} · 보냄 ${r.wire} · 페이지 ${r.page}"
        }
        assertEquals(wrong.joinToString("\n"), 0, wrong.size)
    }

    /** 🧭 실물 인성 팝업은 화면 전체를 덮어 페이지 글자가 없다 — 직전 페이지 위의 팝업으로 본다(확정 전 상세에서 연 출발지 팝업은 확정 전 상세) */
    @Test fun `페이지 글자 없는 팝업은 직전 페이지 위의 덧칸`() {
        val popup = "출발지 상세 고객 부서 담당 마일리지 전화1 전화2 출발 위치 닫기 위치보기 위치저장 길안내"
        val insung = plugins.getValue("insung").screens
        val r = ScreenDetector().detect(popup, insung, lastPage = "확정 전 상세")
        assertEquals("POPUP_PICKUP", r.context.name)
        assertEquals("DETAIL_PRE_CONFIRM", r.wire.name)
        assertEquals("확정 전 상세", r.page)
        assertEquals("출발지 상세 팝업", r.overlay)
        assertEquals("DETAIL_CONFIRMED", ScreenDetector().detect(popup, insung, lastPage = "확정 뒤 상세").wire.name)
    }
}

