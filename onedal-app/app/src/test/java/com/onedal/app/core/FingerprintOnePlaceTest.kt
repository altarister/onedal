package com.onedal.app.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * 🧮 **콜 지문은 한 곳에서, 목록 카드로만 뜬다**
 *
 * 지문을 부르는 곳마다 식을 따로 적으면 «어느 글자로 뜨는가»를 아무도 지키지 않는다.
 * 픽커는 상세 사진을 읽으면 세션의 콜(`lastDetailOrder`)이 긴 주소로 덮여, 그것으로 뜬 지문은 목록 지문과 달라
 * 취소된 콜을 «막았다»로 내리지 못했다(헛돌고 로그도 없음). 누를 때 쥔 카드(`alarmTappedCard`)는
 * 기억에 넣은 지문과 같은 블록에서 같은 콜로 세워지므로 그것으로 내린다.
 */
class FingerprintOnePlaceTest {

    private fun codeOnly(path: String) = File(path).readText()
        .replace(Regex("/\\*[\\s\\S]*?\\*/"), "").replace(Regex("//.*"), "")

    private val root = File("src/main/java/com/onedal/app")
    private val formula = Regex("""pickup\s*\+\s*\S*dropoff\s*\+\s*\S*fare\.toString\(\)\)\.hashCode\(\)""")

    @Test
    fun `지문 식은 CallMemory 한 곳에만 있다`() {
        val holders = root.walkTopDown().filter { it.extension == "kt" }
            .filter { formula.containsMatchIn(codeOnly(it.path)) }.map { it.name }.toList()
        assertEquals("지문 식이 여러 곳에 흩어져 있다: $holders", listOf("CallMemory.kt"), holders)
    }

    @Test
    fun `결재 뒤 내리기는 누를 때 쥔 카드로 지문을 뜬다 - 사진 글자로 덮인 콜은 보지 않는다`() {
        val body = codeOnly("src/main/java/com/onedal/app/HijackService.kt")
            .substringAfter("private fun executeDecisionImmediately(").substringBefore("\n    private fun ")
        assertTrue("누를 때 쥔 카드로 내리지 않는다", body.contains("session.alarmTappedCard?.let"))
        assertFalse("상세 글자로 덮일 수 있는 콜(lastDetailOrder)로 지문을 뜬다", body.contains("lastDetailOrder"))
        assertEquals("내리기가 한 곳이어야 한다", 1, Regex("""demoteActed\(""").findAll(body).count())
    }
}
