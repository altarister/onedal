package com.onedal.app.plugins.kakaopicker

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * 🔄 **픽커 알람이 읽는 필터 값의 지문** (라이브 09-30 21:36:04 · 1f «가»).
 * 서버 필터 원문은 알람이 안 읽는 칸(경유 순서 목록의 km 수)만 달라져도 버전이 바뀐다 — 그때는 막은 기억을 비우지 않는다.
 * 알람이 읽는 칸(요금·반경·도착 목록·예약 …)이 바뀌면 지문이 바뀐다.
 */
class PickerFilterValuesKeyTest {
    private fun filter(minFare: Int, hannamKm: Double) =
        """{"minFare":$minFare,"pickupRadiusKm":16.87,"destinationKeywords":["가락동"],"orderKm":{"한남동":$hannamKm},"reservationMode":"tomorrowToo"}"""

    @Test fun `경유 순서 km 만 다르면 같은 지문`() =
        assertEquals(KakaoPickerParser.alarmValuesKeyOf(filter(6000, 3.2)), KakaoPickerParser.alarmValuesKeyOf(filter(6000, 4.1)))

    @Test fun `최소 요금이 바뀌면 다른 지문`() =
        assertNotEquals(KakaoPickerParser.alarmValuesKeyOf(filter(6000, 3.2)), KakaoPickerParser.alarmValuesKeyOf(filter(7000, 3.2)))

    @Test fun `목록 스캔이 판정 값 지문으로 막은 기억을 가르고 버전만 바뀌면 한 줄`() {
        val src = File("src/main/java/com/onedal/app/HijackService.kt").readText()
        assertTrue(src.contains("callMemory.onFilter(filterVersionNow, scrapParser.judgmentValuesKey())"))
        assertTrue(src.contains("🧾 [필터 버전만 바뀜]"))
    }
}
