package com.onedal.app.core

import com.onedal.app.models.SimplifiedOfficeOrder
import com.onedal.app.plugins.DestinationList
import com.onedal.app.plugins.kakaopicker.KakaoPickerParser
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * 🧭 **운행 중 픽커가 경로 밖 하차를 거른다 · 채운 뒤 필터는 두 길이 같은 한 번** (기사님 «하차를 모르면 통과 싹 지워버려»)
 *
 * 서버는 운행 중 도착 동을 경유 순서 목록(`orderKm`)으로 옮겨 보낸다. 인성·화물24시는 합쳤지만 픽커는 안 읽어
 * 도착 목록이 비고, «비면 통과» 로 파주·부천·대구행이 다 울렸다. 또 픽커(사진 길)는 채운 뒤 필터를 다시 걸지 않았다.
 */
class FilterAfterFillTest {

    private fun codeOnly(path: String) = File(path).readText()
        .replace(Regex("/\\*[\\s\\S]*?\\*/"), "").replace(Regex("//.*"), "")

    private val root = "src/main/java/com/onedal/app"

    @Test
    fun `도착 목록은 키워드와 경유 순서 목록을 합친다`() {
        assertEquals(listOf("초월읍", "곤지암읍"), DestinationList.of(emptyList(), listOf("초월읍", "곤지암읍")))
        assertEquals(listOf("교동", "초월읍"), DestinationList.of(listOf("교동", "초월읍"), listOf("초월읍")))
    }

    @Test
    fun `운행 중 픽커 - 합친 도착 목록 밖 하차는 떨어진다`() {
        val dest = DestinationList.of(emptyList(), listOf("초월읍", "곤지암읍"))
        val o = SimplifiedOfficeOrder(
            id = "p", type = "NEW_ORDER", pickup = "경기 광주시 곤지암읍", dropoff = "경기 파주시 금촌동",
            fare = 20000, timestamp = "2026-09-28T12:00:00", pickupDistance = 2.0,
        )
        assertFalse(KakaoPickerParser.decide(o, minFare = 0, pickupRadiusKm = 10.0, destKeywords = dest))
        assertTrue(KakaoPickerParser.decide(o.copy(dropoff = "경기 광주시 초월읍"), minFare = 0, pickupRadiusKm = 10.0, destKeywords = dest))
    }

    @Test
    fun `세 파서가 같은 도착 목록 함수를 쓴다 - 픽커도 경유 순서 목록을 읽는다`() {
        for (f in listOf("insung/InsungParser.kt", "hwamul24/Hwamul24Parser.kt", "kakaopicker/KakaoPickerParser.kt")) {
            assertTrue("$f 가 DestinationList.of 를 안 쓴다", codeOnly("$root/plugins/$f").contains("DestinationList.of("))
        }
        assertTrue(codeOnly("$root/plugins/kakaopicker/KakaoPickerParser.kt").contains("\"orderKm\""))
    }

    @Test
    fun `채운 뒤 필터는 글자 길과 사진 길이 같은 함수로 한 번`() {
        val src = codeOnly("$root/core/engine/PreConfirmSequence.kt")
        assertTrue("두 길이 같은 함수를 부르지 않는다", Regex("""passesFilterAfterFill\(""").findAll(src).count() >= 3)   // 정의 1 + 두 길
        assertEquals("재검 식이 공통 함수 밖에 흩어져 있다", 1, Regex("""scrapParser\.shouldClick\(""").findAll(src).count())
    }
}
