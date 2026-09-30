package com.onedal.app.core

import com.onedal.app.core.engine.FareFloor
import com.onedal.app.models.FilterConfig
import com.onedal.app.models.SimplifiedOfficeOrder
import com.onedal.app.plugins.insung.InsungParser
import com.onedal.app.plugins.kakaopicker.KakaoPickerParser
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * 💵 **최소 금액은 세 배차망에 같은 식으로 걸린다** (기사님 «화물24시·인성·픽커 모두 공통으로» · 인성은 «가»)
 *
 * 인성은 단가표가 서면 최소 금액을 안 봐서, 단가로는 통과인 짧은 콜이 막대 아래여도 들어왔다.
 * 픽커는 막대가 아니라 따로 둔 «픽커 알람 하한»을 봐서 막대를 옮겨도 아무 일이 없었다.
 */
class FareFloorTest {

    private fun codeOnly(path: String) = File(path).readText()
        .replace(Regex("/\\*[\\s\\S]*?\\*/"), "").replace(Regex("//.*"), "")

    private val plugins = "src/main/java/com/onedal/app/plugins"

    @Test
    fun `막대 0 은 끈 것이다 - 그 밖에는 요금이 막대 이상이어야 한다`() {
        assertTrue(FareFloor.passes(3000, 0))
        assertTrue(FareFloor.passes(20000, 20000))
        assertFalse(FareFloor.passes(19999, 20000))
    }

    private fun insungFilter(minFare: Int) = FilterConfig(
        isActive = true,
        isSharedMode = true,
        minFare = minFare,
        ratePerKm = mapOf("다마스" to 554),
        destinationKeywords = listOf("초월읍"),
    )

    private fun insungOrder(fare: Int) = SimplifiedOfficeOrder(
        id = "t", type = "NEW_ORDER",
        pickup = "경기 광주시 태전동", dropoff = "경기 광주시 초월읍", fare = fare,
        timestamp = "2026-09-28T10:00:00",
        vehicleType = "다마스", rawText = "경기 광주시 태전동 경기 광주시 초월읍",
        deliveryDistance = 20.0,
    )

    @Test
    fun `인성 - 단가로는 통과인 콜도 막대 아래면 떨어진다`() {
        // 20km × 554 = 11,080원 — 18,000원은 단가 통과, 막대 20,000원 아래
        assertTrue("대조군: 막대 위 콜은 통과해야 한다", InsungParser.decide(insungOrder(25000), insungFilter(20000)))
        assertFalse(InsungParser.decide(insungOrder(18000), insungFilter(20000)))
        assertTrue("막대 0 은 끈 것", InsungParser.decide(insungOrder(18000), insungFilter(0)))
    }

    @Test
    fun `픽커 - 막대 아래 콜은 떨어지고 막대 0 은 통과한다`() {
        val o = SimplifiedOfficeOrder(
            id = "p", type = "NEW_ORDER", pickup = "성남시 분당구 정자동", dropoff = "성남시 분당구 서현동",
            fare = 8000, timestamp = "2026-09-28T10:00:00", pickupDistance = 2.0,
        )
        assertFalse(KakaoPickerParser.decide(o, minFare = 10000, pickupRadiusKm = 10.0))
        assertTrue(KakaoPickerParser.decide(o, minFare = 0, pickupRadiusKm = 10.0))
    }

    @Test
    fun `세 파서가 요금 축에서 FareFloor 를 부른다 - 제 식으로 되돌아가지 않는다`() {
        for (f in listOf("insung/InsungParser.kt", "hwamul24/Hwamul24Parser.kt", "kakaopicker/KakaoPickerParser.kt")) {
            val src = codeOnly("$plugins/$f")
            assertTrue("$f 가 FareFloor.passes 를 부르지 않는다", src.contains("FareFloor.passes("))
            assertFalse("$f 에 제 요금 하한 식이 남아 있다", Regex("""fare\s*>=\s*(filter\.)?minFare""").containsMatchIn(src))
        }
    }

    @Test
    fun `픽커는 막대(minFare)를 읽는다 - 따로 둔 픽커 알람 하한을 읽지 않는다`() {
        val app = File("src/main/java/com/onedal/app").walkTopDown().filter { it.extension == "kt" }
            .filter { codeOnly(it.path).contains("pickerAlarmMinFare") }.map { it.name }.toList()
        assertEquals("원달앱이 아직 픽커 알람 하한을 읽는다: $app", emptyList<String>(), app)
        assertTrue(codeOnly("$plugins/kakaopicker/KakaoPickerParser.kt").contains("value(\"minFare\")"))
    }
}
