package com.onedal.app.core

import com.onedal.app.models.SimplifiedOfficeOrder
import com.onedal.app.plugins.kakaopicker.KakaoPickerParser
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * 🧭 **운행 중 픽커가 하차 목록 밖 하차를 거른다 · 채운 뒤 필터는 두 길이 같은 한 번** (기사님 «하차를 모르면 통과 싹 지워버려»)
 *
 * 세 파서가 같은 하차 목록(서버 destinationKeywords · `FilterStore` 한 곳에서 읽음)을 본다 — 한 배차망이라도 다른 목록을 보면
 * 그 배차망만 경로 밖 하차가 울린다. 사진으로 채운 콜도 채운 뒤 필터를 다시 건다.
 */
class FilterAfterFillTest {

    private fun codeOnly(path: String) = File(path).readText()
        .replace(Regex("/\\*[\\s\\S]*?\\*/"), "").replace(Regex("//.*"), "")

    private val root = "src/main/java/com/onedal/app"

    @Test
    fun `운행 중 픽커 - 하차 목록 밖 하차는 떨어진다`() {
        val dest = listOf("초월읍", "곤지암읍")
        val o = SimplifiedOfficeOrder(
            id = "p", type = "NEW_ORDER", pickup = "경기 광주시 곤지암읍", dropoff = "경기 파주시 금촌동",
            fare = 20000, timestamp = "2026-09-28T12:00:00", pickupDistance = 2.0,
        )
        assertFalse(KakaoPickerParser.decide(o, minFare = 0, pickupRadiusKm = 10.0, destKeywords = dest))
        assertTrue(KakaoPickerParser.decide(o.copy(dropoff = "경기 광주시 초월읍"), minFare = 0, pickupRadiusKm = 10.0, destKeywords = dest))
    }

    @Test
    fun `세 파서가 같은 하차 목록을 읽는다 - FilterStore 한 곳`() {
        /* 필터 읽기는 FilterStore 한 곳 — 하차 목록은 destinationKeywords 그대로이고, 세 파서가 그것을 읽는다 */
        val store = codeOnly("$root/core/FilterStore.kt")
        assertTrue(store.contains("\"destinationKeywords\""))
        assertFalse("옛 경로 순서 칸을 읽는다", store.contains("\"orderKm\""))
        for (f in listOf("insung/InsungParser.kt", "hwamul24/Hwamul24Parser.kt", "kakaopicker/KakaoPickerParser.kt")) {
            assertTrue("$f 가 FilterStore 를 안 읽는다", codeOnly("$root/plugins/$f").contains("FilterStore."))
        }
    }

    @Test
    fun `채운 뒤 필터는 어느 배차망이든 같은 함수로 한 번 - 글자로 채운 콜도 사진으로 채운 콜도`() {
        val src = codeOnly("$root/core/engine/PreConfirmSequence.kt")
        assertTrue("두 길이 같은 함수를 부르지 않는다", Regex("""passesFilterAfterFill\(""").findAll(src).count() >= 3)   // 정의 1 + 두 길
        assertEquals("재검 식이 공통 함수 밖에 흩어져 있다", 1, Regex("""scrapParser\.shouldClick\(""").findAll(src).count())
    }
}
