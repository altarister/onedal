package com.onedal.app.plugins.insung

import org.junit.Assert.assertEquals
import org.junit.Test
import java.util.Locale

/**
 * 🚚 **인성 차종 낱말도 배차망 정의 표(vehicleWords) 한 곳에서** — 옮겨도 인성 답은 한 줄도 안 바뀐다 (onedal-69 차종 2단계)
 *
 * 아래 `old…` 는 옮기기 전 코드 그대로다(InsungParser 51 · 229). 토큰 × 허용 차종 격자 전부에서 옛 답 == 새 답,
 * 카드 묶기 닻(토큰 정규식)도 옛 정규식과 같은 글에 맞는다.
 */
class InsungVehicleWordsTest {
    private val oldTokens = "오|다|라|승|1t|1\\.4|2\\.5t?|3\\.5t?|5t|11t|14t|18t|25t"
    private val oldOnly = Regex("^($oldTokens)$")
    private val oldWithFare = Regex("($oldTokens)\\s*(\\d+(?:\\.\\d+)?)")

    private fun oldNormalize(s: String): String {
        val v = s.lowercase(Locale.getDefault()).replace(" ", "").replace("톤", "t")
        return if (Regex("""^\d+(\.\d+)?$""").matches(v)) "${v}t" else v
    }
    private fun oldMatches(allowed: String, parsed: String): Boolean {
        val a = oldNormalize(allowed)
        val p = oldNormalize(parsed)
        return when (a) {
            "다마스" -> p == "다" || p == "다마스"
            "라보" -> p == "라" || p == "라보"
            "승용차" -> p == "승" || p == "승용차"
            "오토바이" -> p == "오" || p == "바" || p == "오토바이" || p == "바이"
            else -> a == p
        }
    }

    /** 인성 화면 차종 토큰 — readVehicleAndFare 가 order.vehicleType 에 싣는 값은 이 중 하나다 */
    private val tokens = listOf("오", "다", "라", "승", "1t", "1.4", "2.5t", "2.5", "3.5t", "3.5", "5t", "11t", "14t", "18t", "25t")
    private val allowed = listOf("오토바이", "다마스", "라보", "승용차", "1t", "1.4t", "2.5t", "3.5t", "5t", "11t", "25t", "특수화물", "1톤", "1 t", "2.5")

    @Test fun `표의 낱말은 지금 토큰 열다섯 그대로`() = assertEquals(tokens.toSet(), InsungPages.vehicleWords.keys)

    @Test fun `토큰 × 허용 차종 격자 전부 - 옛 답 == 새 답`() {
        for (t in tokens) for (a in allowed)
            assertEquals("$a ← $t", oldMatches(a, t), InsungParser.vehicleMatches(a, t))
    }

    @Test fun `카드 묶기 닻 - 옛 정규식과 같은 글에 맞는다`() {
        val samples = tokens + listOf("라2.2", "다 3.5", "1.4", "2.5t", "14t", "1t화물", "바", "오토바이", "2.55", "11t4", "승용", "")
        for (s in samples) {
            assertEquals("닻 «$s»", oldOnly.matches(s), InsungParser.VEHICLE_ONLY.matches(s))
            assertEquals("뭉친 «$s»", oldWithFare.find(s)?.groupValues, InsungParser.VEHICLE_WITH_FARE.find(s)?.groupValues)
        }
    }
}
