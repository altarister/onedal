package com.onedal.app.plugins.insung

import org.junit.Assert.assertEquals
import org.junit.Test
import java.util.Locale

/**
 * 🚚 **인성 차종 낱말도 배차망 정의 표(vehicleWords) 한 곳에서** — 옮겨도 인성 답은 한 줄도 안 바뀐다 (onedal-69 차종 2단계)
 *
 * 아래 `old…` 는 옮기기 전 코드 그대로다(InsungParser 51 · 229). 토큰 × 허용 차종 격자 전부에서 옛 답 == 새 답,
 * 목록 줄을 묶는 기준 칸(토큰 정규식)도 옛 토큰에서는 옛 정규식과 같은 글에 맞고, 표의 낱말 전부(상세 낱말 포함)가 기준 칸이 된다.
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
    /** 옛 정규식에 없던 낱말 — 영상 1719 «용/소». 뜻을 몰라 차종은 모름(null)이다 */
    private val unknownVehicleWords = listOf("용/소")
    /** 목록 밖의 낱말 — 확정 뒤 상세 «차량 : 트럭-1t» · «차량 : 다마스-다마» 류 · 오토바이 줄임말 «바이크» (서버 차종 맞춤이 같은 표를 읽는다) */
    private val detailWords = mapOf(
        "바이크" to "오토바이", "트럭-1t" to "1t", "트럭-1.4t" to "1.4t", "트럭-2.5t" to "2.5t",
        "트럭-3.5t" to "3.5t", "트럭-5t" to "5t", "트럭-11t" to "11t", "트럭-25t" to "25t",
        "다마스-다마" to "다마스",
    )
    /** 허용 차종 — 서버가 보내는 우리 차종 이름 열둘(shared VEHICLE_OPTIONS) */
    private val allowed = listOf("오토바이", "다마스", "라보", "승용차", "1t", "1.4t", "2.5t", "3.5t", "5t", "11t", "25t", "특수화물")

    @Test fun `표의 낱말은 옛 토큰 열다섯에 모르는 차종 낱말과 목록 밖 낱말을 더한 것`() =
        assertEquals((tokens + unknownVehicleWords + detailWords.keys).toSet(), InsungPages.vehicleWords.keys)

    @Test fun `목록 밖 낱말은 그 차종 하나에만 맞는다`() {
        for ((word, vehicle) in detailWords) for (a in allowed)
            assertEquals("$a ← $word", a == vehicle, InsungParser.vehicleMatches(a, word))
    }

    @Test fun `토큰 × 허용 차종 격자 전부 - 옛 답 == 새 답`() {
        for (t in tokens) for (a in allowed)
            assertEquals("$a ← $t", oldMatches(a, t), InsungParser.vehicleMatches(a, t))
    }

    @Test fun `모르는 차종 낱말은 어느 허용 차종에도 맞지 않는다 - 옛 답 false · 새 답 false`() {
        for (t in unknownVehicleWords) for (a in allowed) {
            assertEquals("옛 $a ← $t", false, oldMatches(a, t))
            assertEquals("새 $a ← $t", false, InsungParser.vehicleMatches(a, t))
        }
    }

    @Test fun `목록 줄 기준 칸 - 옛 정규식과 같은 글에 맞는다`() {
        val samples = tokens + listOf("라2.2", "다 3.5", "1.4", "2.5t", "14t", "1t화물", "바", "오토바이", "2.55", "11t4", "승용", "")
        for (s in samples) {
            assertEquals("기준 칸 «$s»", oldOnly.matches(s), InsungParser.VEHICLE_ONLY.matches(s))
            assertEquals("뭉친 «$s»", oldWithFare.find(s)?.groupValues, InsungParser.VEHICLE_WITH_FARE.find(s)?.groupValues)
        }
    }

    @Test fun `목록 줄 기준 칸 - 새 낱말만 옛 정규식은 안 맞고 새 정규식은 맞는다`() {
        for (t in unknownVehicleWords) {
            assertEquals("옛 기준 칸 «$t»", false, oldOnly.matches(t))
            assertEquals("새 기준 칸 «$t»", true, InsungParser.VEHICLE_ONLY.matches(t))
            assertEquals("옛 뭉친 «$t 38.5»", null, oldWithFare.find("$t 38.5"))
            assertEquals("새 뭉친 «$t 38.5»", listOf("$t 38.5", t, "38.5"), InsungParser.VEHICLE_WITH_FARE.find("$t 38.5")?.groupValues)
        }
    }

    @Test fun `목록 줄 기준 칸 - 상세 낱말도 기준 칸이 되고 차종 · 요금으로 읽힌다`() {
        for (w in detailWords.keys) {
            assertEquals("기준 칸 «$w»", true, InsungParser.VEHICLE_ONLY.matches(w))
            assertEquals("묶음 «$w»", listOf(0), InsungParser.cardAnchorIndices(listOf(Triple(w, 0, 10))))
            assertEquals("요금 «$w 25.0»", w to 25_000, InsungParser.readVehicleAndFare(listOf(w, "25.0")))
            assertEquals("뭉친 «$w 3»", listOf("$w 3", w, "3"), InsungParser.VEHICLE_WITH_FARE.find("$w 3")?.groupValues)
        }
        // 뭉친 노드 «바이크 3» — 옛 정규식은 아무것도 못 찾고, 지금은 차종 «바이크» · 요금 3,000원
        assertEquals(null, oldWithFare.find("바이크 3"))
        assertEquals(listOf(0), InsungParser.cardAnchorIndices(listOf(Triple("바이크 3", 0, 10))))
        assertEquals("바이크" to 3_000, InsungParser.readVehicleAndFare(listOf("바이크 3")))
        // «트럭-1t 25,000» — 옛 정규식은 뒤쪽 «1t» 를 잡았고, 지금은 긴 낱말 «트럭-1t» 를 잡는다.
        // 요금은 쉼표를 떼고 천 원 단위로 읽으므로 25,000 은 25,000,000 원이 된다(목록 요금 칸의 단위 그대로)
        assertEquals(listOf("1t 25", "1t", "25"), oldWithFare.find("트럭-1t 25,000")?.groupValues)
        assertEquals(listOf("트럭-1t 25", "트럭-1t", "25"), InsungParser.VEHICLE_WITH_FARE.find("트럭-1t 25,000")?.groupValues)
        assertEquals("트럭-1t" to 25_000_000, InsungParser.readVehicleAndFare(listOf("트럭-1t 25,000")))
    }
}
