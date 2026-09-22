package com.onedal.app.core.engine

import com.google.gson.Gson
import com.onedal.app.core.TargetApp
import com.onedal.app.models.FilterConfig
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * ⏱️ **배차망별 대기 시간 — 서버가 정하고 원달앱은 받아 쓴다** (기사님 확정 2026-09-14)
 *
 * 기사님: *"서버가 30초란걸 알고 있고 그걸 받아서 스켄앱이 그렇게 작동해야 하는거야."*
 *
 * 예전엔 원달앱이 **폰 안 저장소**(설정 화면 30·40·50초)와 **코드 숫자 30초**로 따로 돌았다.
 * 서버는 그 값을 몰랐다.
 */
class WaitTimesTest {

    @Test
    fun `인성·화물24시는 각자의 안전취소 시간을 쓴다`() {
        val f = FilterConfig(safeCancelSecInsung = 45, safeCancelSecHwamul24 = 20)
        assertEquals(45_000L, WaitTimes.safeCancelMs(f, TargetApp.INSUNG))
        assertEquals(20_000L, WaitTimes.safeCancelMs(f, TargetApp.HWAMUL24))
    }

    @Test
    fun `🔴 픽커는 안전취소가 없다 - 수락하기가 곧 계약이라 취소할 시간이 없다`() {
        assertNull(WaitTimes.safeCancelMs(FilterConfig(safeCancelSecInsung = 45), TargetApp.KAKAOPICKER))
    }

    @Test
    fun `픽커 알람 상세는 그 시간 뒤 닫는다 - 안전취소 시간과 다른 값이다`() {
        val f = FilterConfig(safeCancelSecInsung = 30, pickerAlarmDetailSec = 90)
        assertEquals(90_000L, WaitTimes.pickerAlarmDetailMs(f))
    }

    @Test
    fun `서버 응답이 없을 때 - 인성 30초 · 화물24시 30초 · 픽커 30초 (서버 DB 기본값과 같다)`() {
        val f = FilterConfig()
        assertEquals(30_000L, WaitTimes.safeCancelMs(f, TargetApp.INSUNG))
        assertEquals(30_000L, WaitTimes.safeCancelMs(f, TargetApp.HWAMUL24))
        assertEquals(30_000L, WaitTimes.pickerAlarmDetailMs(f))
    }

    @Test
    fun `🔴 서버가 보낸 이름 그대로 받는다 - 이름이 어긋나면 조용히 기본값으로 돈다`() {
        val json = """{"safeCancelSecInsung":40,"safeCancelSecHwamul24":25,"pickerAlarmDetailSec":75}"""
        val f = Gson().fromJson(json, FilterConfig::class.java)
        assertEquals(40_000L, WaitTimes.safeCancelMs(f, TargetApp.INSUNG))
        assertEquals(25_000L, WaitTimes.safeCancelMs(f, TargetApp.HWAMUL24))
        assertEquals(75_000L, WaitTimes.pickerAlarmDetailMs(f))
    }
}
