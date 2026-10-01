package com.onedal.app.core

import com.onedal.app.models.FilterConfig
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * 🎛️ **피기백 필터 읽기는 한 곳** (onedal-69(1f) «가»).
 * 인성 · 화물24시는 org.json 으로 읽어 JVM 검사에서 못 돌았다(빈 껍데기) — 그 읽기 규칙을 여기 기대값 표로 묶는다.
 * 판정 결과가 바뀌지 않는 것이 기준이다. 깨진 입력에서만 갈리는 것은 픽커 규칙(깨진 원소만 뺀다)으로 한다.
 */
class FilterStoreTest {
    private fun of(json: String) = FilterStore.parse(json)

    @Test fun `없음 · 깨진 JSON · 객체 아님은 기본값`() {
        assertEquals(FilterConfig(), FilterStore.parse(null))
        assertEquals(FilterConfig(), of("{깨짐"))
        assertEquals(FilterConfig(), of("[1,2]"))
    }

    @Test fun `isActive 칸이 없으면 멈춘다 · 있으면 그대로`() {
        assertFalse(of("""{"minFare":5000}""").isActive)
        assertTrue(of("""{"isActive":true}""").isActive)
    }

    @Test fun `reservationMode 빈 글자 · null · 없음은 null`() {
        assertNull(of("""{"reservationMode":""}""").reservationMode)
        assertNull(of("""{"reservationMode":null}""").reservationMode)
        assertNull(of("""{}""").reservationMode)
        assertEquals("tomorrowToo", of("""{"reservationMode":"tomorrowToo"}""").reservationMode)
    }

    @Test fun `도착 목록 = 키워드 ∪ 경유 순서 목록 키 · 빈 글자 빼고 겹침 하나`() {
        val f = of("""{"destinationKeywords":["가락동","","문정동"],"orderKm":{"한남동":3.2,"가락동":5.0}}""")
        assertEquals(listOf("가락동", "문정동", "한남동"), f.destinationKeywords)
    }

    @Test fun `상차 목록 - 칸이 없으면 null · 빈 목록은 빈 목록 · 빈 글자는 남는다`() {
        assertNull(of("""{}""").pickupKeywords)
        assertEquals(emptyList<String>(), of("""{"pickupKeywords":[]}""").pickupKeywords)
        assertEquals(listOf(""), of("""{"pickupKeywords":[""]}""").pickupKeywords)
    }

    @Test fun `경유 순서 km 의 null 은 «모름»으로 남는다`() {
        val f = of("""{"orderKm":{"한남동":null,"가락동":4.5}}""")
        assertEquals(mapOf("한남동" to null, "가락동" to 4.5), f.orderKm)
    }

    @Test fun `함정 · 이름 겹침 목록은 빈 글자를 빼고 배열 아닌 값은 건너뛴다`() {
        val f = of("""{"keywordTraps":{"남동":["남동구",""],"x":"글자"},"destinationDongSigungu":{"고덕동":["강동구",""]}}""")
        assertEquals(mapOf("남동" to listOf("남동구")), f.keywordTraps)
        assertEquals(mapOf("고덕동" to listOf("강동구")), f.destinationDongSigungu)
    }

    @Test fun `평 목록은 빈 글자를 남긴다 · 배열이 아니면 빈 목록`() {
        val f = of("""{"allowedVehicleTypes":["1t",""],"excludedKeywords":"글자","customCityFilters":["수정"]}""")
        assertEquals(listOf("1t", ""), f.allowedVehicleTypes)
        assertEquals(emptyList<String>(), f.excludedKeywords)
        assertEquals(listOf("수정"), f.customCityFilters)
    }

    @Test fun `깨진 원소(null)만 뺀다 — 목록을 통째로 비우지 않는다`() {
        assertEquals(listOf("가락동"), of("""{"destinationKeywords":["가락동",null]}""").destinationKeywords)
        /* 섞인 배열 — 객체 · 배열 원소만 빠지고 글자는 남는다(인성 옛것은 목록을 통째로 비웠다 · 일부러 바꾼 것) */
        assertEquals(listOf("가락동", "문정동"), of("""{"destinationKeywords":["가락동",{"a":1},["x"],"문정동"]}""").destinationKeywords)
    }

    @Test fun `정수 칸은 소수면 버림 · 숫자 글자도 읽는다 · 단가표 숫자 아니면 0`() {
        val f = of("""{"minFare":30000.9,"maxFare":"500000","ratePerKm":{"1t":693.6,"다마스":"x"}}""")
        assertEquals(30000, f.minFare)
        assertEquals(500000, f.maxFare)
        assertEquals(mapOf("1t" to 693, "다마스" to 0), f.ratePerKm)
    }

    @Test fun `없는 칸은 기본값 — 반경 · 요금 · 기다림`() {
        val f = of("""{}""")
        assertEquals(10.0, f.pickupRadiusKm, 0.0)
        assertEquals(30000, f.minFare)
        assertEquals(1000000, f.maxFare)
        assertEquals(30, f.safeCancelSecInsung)
        assertEquals(30, f.pickerAlarmDetailSec)
        assertEquals("", f.destinationCity)
    }

    @Test fun `서버가 보내는 값 그대로 — 소수 반경 · 기다림 · 선점 중 · 내일 상차`() {
        val f = of("""{"pickupRadiusKm":4.55,"safeCancelSecInsung":45,"pickerAlarmDetailSec":60,"evaluatingNow":true,"isSharedMode":true,
            "reservedPickupRadiusKm":7.5,"reservedPickupKeywords":["가락동"],"reservedPickupGroups":{"송파구":["가락동"]}}""")
        assertEquals(4.55, f.pickupRadiusKm, 0.0)
        assertEquals(45, f.safeCancelSecInsung)
        assertEquals(60, f.pickerAlarmDetailSec)
        assertTrue(f.evaluatingNow)
        assertTrue(f.isSharedMode)
        assertEquals(7.5, f.reservedPickupRadiusKm!!, 0.0)
        assertEquals(listOf("가락동"), f.reservedPickupKeywords)
        assertEquals(mapOf("송파구" to listOf("가락동")), f.reservedPickupGroups)
    }

    @Test fun `내일 상차 칸이 없으면 null(반경 길)`() {
        val f = of("""{}""")
        assertNull(f.reservedPickupRadiusKm)
        assertNull(f.reservedPickupKeywords)
        assertNull(f.reservedPickupGroups)
    }

    private val root = "src/main/java/com/onedal/app"
    private fun mainFiles() = File(root).walkTopDown().filter { it.isFile && it.extension == "kt" && it.name != "FilterStore.kt" }

    @Test fun `필터를 따로 푸는 곳이 FilterStore 밖에 없다`() {
        val stray = mainFiles().filter { f ->
            val t = f.readText()
            Regex("""fromJson\([^)]*FilterConfig""").containsMatchIn(t) ||
                Regex("""fun parse(JsonArray|RateMap|OrderMap|TrapsMap)\(""").containsMatchIn(t) ||
                Regex("""JSONObject\(jsonStr\)""").containsMatchIn(t)
        }.map { it.name }.toList()
        assertEquals(emptyList<String>(), stray)
    }

    @Test fun `인성 · 화물24시 · 픽커가 FilterStore 를 읽는다`() {
        for (p in listOf("plugins/insung/InsungParser.kt", "plugins/hwamul24/Hwamul24Parser.kt"))
            assertTrue(p, File("$root/$p").readText().contains("FilterStore.current("))
        assertTrue(File("$root/plugins/kakaopicker/KakaoPickerParser.kt").readText().contains("FilterStore.parse("))
    }
}
