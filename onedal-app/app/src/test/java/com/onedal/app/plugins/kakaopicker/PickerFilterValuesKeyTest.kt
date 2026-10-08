package com.onedal.app.plugins.kakaopicker

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * 🔄 **픽커 알람이 읽는 필터 값의 지문** (라이브 · 1f «가»).
 * 서버 필터 원문은 알람이 안 읽는 칸(인성 안전취소 초 등)만 달라져도 버전이 바뀐다 — 그때는 막은 기억을 비우지 않는다.
 * 알람이 읽는 칸(요금·반경·도착 목록·예약 …)이 바뀌면 지문이 바뀐다.
 */
class PickerFilterValuesKeyTest {
    private fun filter(minFare: Int, insungSec: Int) =
        """{"minFare":$minFare,"pickupRadiusKm":16.87,"destinationKeywords":["가락동"],"safeCancelSecInsung":$insungSec,"reservationMode":"tomorrowToo"}"""

    @Test fun `알람이 안 읽는 칸만 다르면 같은 지문`() =
        assertEquals(KakaoPickerParser.alarmValuesKeyOf(filter(6000, 30)), KakaoPickerParser.alarmValuesKeyOf(filter(6000, 45)))

    @Test fun `최소 요금이 바뀌면 다른 지문`() =
        assertNotEquals(KakaoPickerParser.alarmValuesKeyOf(filter(6000, 30)), KakaoPickerParser.alarmValuesKeyOf(filter(7000, 30)))

    private fun held(hold: String) = filter(6000, 30).dropLast(1) + ""","captureHold":"$hold"}"""

    /** 🔒 잡기 보류(만석 · 필터 고장 · 35 X6 ①) — 보류 동안 «탈락»으로 막은 콜이 풀린 뒤 다시 울리려면 지문이 바뀌어야 한다 */
    @Test fun `잡기 보류가 걸리고 풀리면 다른 지문`() =
        assertNotEquals(KakaoPickerParser.alarmValuesKeyOf(filter(6000, 30)), KakaoPickerParser.alarmValuesKeyOf(held("만석")))

    @Test fun `잡기 보류 까닭 — 칸이 있으면 그 글 · 없거나 비면 null(옛 서버 · 보류 없음은 지금처럼 판정)`() {
        assertEquals("만석", KakaoPickerParser.heldBy(held("만석")))
        assertEquals(null, KakaoPickerParser.heldBy(filter(6000, 30)))
        assertEquals(null, KakaoPickerParser.heldBy(held("")))
        assertEquals(null, KakaoPickerParser.heldBy(null))
    }

    @Test fun `목록 스캔이 판정 값 지문으로 막은 기억을 가르고 버전만 바뀌면 한 줄`() {
        val src = File("src/main/java/com/onedal/app/HijackService.kt").readText()
        assertTrue(src.contains("callMemory.onFilter(filterVersionNow, scrapParser.judgmentValuesKey())"))
        assertTrue(src.contains("🧾 [필터 버전만 바뀜]"))
    }
}
