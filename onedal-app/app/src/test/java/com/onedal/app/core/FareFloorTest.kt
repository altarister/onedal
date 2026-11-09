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
import com.onedal.app.models.CallStop
import com.onedal.app.models.CallLoad

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

    private fun load(vehicle: String?) = CallLoad(vehicle, null, null)

    /** 💰 짐 묶음 차종 글자 → 단가 — 화면 낱말(«오» · «승» · «다» · «1t»)을 차종 맞춤 한 규칙으로 우리 차종에 맞춘 뒤 그 단가 · 표가 비면 null */
    @Test
    fun `차종 글자를 단가표의 차종으로 푼다 - 표가 비면 null`() {
        val rates = mapOf("오토바이" to 700, "승용차" to 900, "다마스" to 800, "1t" to 1000)
        assertEquals(700, FareFloor.rateOf(rates, load("오토"), TargetApp.ISFLEX))
        assertEquals(900, FareFloor.rateOf(rates, load("승"), TargetApp.INSUNG))
        assertEquals(900, FareFloor.rateOf(rates, load("승용차"), TargetApp.INSUNG))
        assertEquals(800, FareFloor.rateOf(rates, load("다"), TargetApp.INSUNG))
        assertEquals(1000, FareFloor.rateOf(rates, load("1t"), TargetApp.INSUNG))
        assertEquals(null, FareFloor.rateOf(emptyMap(), load("1t"), TargetApp.INSUNG))
    }

    /** 🔴 톤 글자 콜(«2.5톤/카고» · «5t» · «11t»)이 1t 단가로 가지 않는다 · 모름(«14톤») · 우리 차종에 없음(«14t») · 수단 상관없음(픽커 빈 칸)은 단가를 안 본다 */
    @Test
    fun `톤 글자 콜은 그 차종 단가 - 우리 차종이 아니면 단가를 안 본다`() {
        val rates = mapOf("오토바이" to 700, "다마스" to 800, "1t" to 1000, "2.5t" to 1200, "5t" to 1500, "11t" to 2000)
        assertEquals(1200, FareFloor.rateOf(rates, load("2.5톤/카고"), TargetApp.HWAMUL24))
        assertEquals(1500, FareFloor.rateOf(rates, load("5t"), TargetApp.INSUNG))
        assertEquals(2000, FareFloor.rateOf(rates, load("11t"), TargetApp.INSUNG))
        assertEquals(null, FareFloor.rateOf(rates, load("14톤"), TargetApp.HWAMUL24))
        assertEquals(null, FareFloor.rateOf(rates, load("14t"), TargetApp.INSUNG))
        assertEquals(null, FareFloor.rateOf(rates, null, TargetApp.KAKAOPICKER))
    }

    /** 🚚 **차종 맞춤 짝** — 공통 문제지 `pageReadCases.json` `vehicleMatchCases` 를 shared `vehicleMatchOf` 와 같은 답으로 푼다 */
    @Test
    fun `차종 맞춤 공통 문제지 - shared 와 같은 답`() {
        val sheet = com.google.gson.JsonParser.parseString(File("../../onedal-web/shared/src/network/pageReadCases.json").readText()).asJsonObject
        val cases = sheet["vehicleMatchCases"].asJsonArray.map { it.asJsonObject }
        assertTrue("문제지가 비었다", cases.size > 5)
        val wrong = cases.filter { c ->
            fun text(k: String) = c[k]?.takeIf { !it.isJsonNull }?.asString
            VehicleMatch.of(load(text("vehicleText")), c["network"].asString) != VehicleMatch(VehicleMatch.Kind.valueOf(c["kind"].asString), text("vehicle"))
        }
        assertEquals(wrong.joinToString("\n") { it["why"].asString }, 0, wrong.size)
    }

    private fun insungFilter(minFare: Int) = FilterConfig(
        allowedVehicleTypes = listOf("다마스"),   // 빈 허용 차종은 «꽉 참»
        isActive = true,
        isSharedMode = true,
        minFare = minFare,
        ratePerKm = mapOf("다마스" to 554),
        destinationKeywords = listOf("초월읍"),
    )

    private fun insungOrder(fare: Int) = SimplifiedOfficeOrder(
        id = "t",
        type = "NEW_ORDER",
        fare = fare, money = com.onedal.app.models.CallMoney.ofIncome(fare),
        timestamp = "2026-09-28T10:00:00",
        vehicleType = "다",   // 인성 목록 차종 칸 글자 — 차종 축이 정의 표로 다마스에 맞춘다
        rawText = "경기 광주시 태전동 경기 광주시 초월읍",
        pickupDetails = listOf(CallStop(listText = "경기 광주시 태전동")),
        dropoffDetails = listOf(CallStop(listText = "경기 광주시 초월읍", distanceKm = 20.0)),
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
            id = "p",
            type = "NEW_ORDER",
            fare = 8000, money = com.onedal.app.models.CallMoney.ofIncome(8000),
            timestamp = "2026-09-28T10:00:00",
            pickupDetails = listOf(CallStop(listText = "성남시 분당구 정자동", distanceKm = 2.0)),
            dropoffDetails = listOf(CallStop(listText = "성남시 분당구 서현동")),
        )
        assertFalse(KakaoPickerParser.decide(o, minFare = 10000, pickupRadiusKm = 10.0))
        assertTrue(KakaoPickerParser.decide(o, minFare = 0, pickupRadiusKm = 10.0))
    }

    @Test
    fun `세 파서가 요금 축에서 FareFloor 를 부른다 - 제 식으로 되돌아가지 않는다`() {
        for (f in listOf("insung/InsungParser.kt", "ListJudge.kt", "kakaopicker/KakaoPickerParser.kt")) {
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
        /* 필터 읽기는 FilterStore 한 곳 — 픽커는 거기서 읽은 minFare 를 쓴다 */
        assertTrue(codeOnly("src/main/java/com/onedal/app/core/FilterStore.kt").contains("value(\"minFare\")"))
        assertTrue(codeOnly("$plugins/kakaopicker/KakaoPickerParser.kt").contains("minFare = f.minFare"))
    }
}
