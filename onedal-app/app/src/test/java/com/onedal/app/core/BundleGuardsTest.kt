package com.onedal.app.core

import com.onedal.app.models.ScreenContext
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * 🧰 **라이브 10-01 00:31~00:33 에서 나온 막기 넷** (onedal-1f «가»).
 * ① 흐르는 목록은 누르지 않는다 — 내려간 목록 누름 #1 요금 Y 716→849 · #2 1013→1932(흐름 멈춤이 됐다)
 * ② 뒤로 가기 «안 먹힘» 판정은 최소 2초 — 00:32:03 뒤로(픽커 전환 0.7~0.9초 + 메인 줄 밀림)를 «안 먹힘»으로 봤다
 * ③ 목록 보고에 «통과 콜이 있는데 앱이 안 연 까닭» 열쇠 하나(openBlocked) — listHeaderHidden 은 이제 안 보낸다
 * ④ 새로 셈한 콜을 한 줄로 — «🔕 이미 알람 낸 콜»만 남아 새로 센 쪽을 못 갈랐다
 */
class BundleGuardsTest {
    @Test fun `흐르는 목록 - 누르기 직전 Y 가 40px 넘게 다르거나 방금 스크롤이면 보류`() {
        assertTrue("#1", TapShift.listMoving(scanY = 716, nowY = 849, scrolledRecently = false))
        assertTrue("#2", TapShift.listMoving(scanY = 1013, nowY = 1932, scrolledRecently = false))
        assertFalse("#3", TapShift.listMoving(scanY = 1028, nowY = 1009, scrolledRecently = false))
        assertFalse("#5", TapShift.listMoving(scanY = 1175, nowY = 1175, scrolledRecently = false))
        assertTrue("방금 스크롤", TapShift.listMoving(scanY = 1175, nowY = 1175, scrolledRecently = true))
    }

    @Test fun `뒤로 가기 안 먹힘 판정은 최소 2초 · 보통 누름은 1초 그대로`() {
        val back = TapInFlight.Record(1, "뒤로", ScreenContext.DETAIL_PRE_CONFIRM, 10_000).copy(completed = true)
        assertEquals(TapInFlight.Verdict.NONE, TapInFlight.judge(back, ScreenContext.DETAIL_PRE_CONFIRM, textChanged = false, nowMs = 11_300))
        assertEquals(TapInFlight.Verdict.NOT_TAKEN, TapInFlight.judge(back, ScreenContext.DETAIL_PRE_CONFIRM, textChanged = false, nowMs = 12_100))
        val row = TapInFlight.Record(2, "call:1", ScreenContext.LIST, 10_000).copy(completed = true)
        assertEquals(TapInFlight.Verdict.NOT_TAKEN, TapInFlight.judge(row, ScreenContext.LIST, textChanged = false, nowMs = 11_300))
    }

    private val root = "src/main/java/com/onedal/app"

    @Test fun `openBlocked 칸 · 열쇠 · 새로 셈 줄`() {
        val model = File("$root/models/SharedModels.kt").readText()
        assertTrue(model.contains("val openBlocked: String? = null"))
        assertFalse("listHeaderHidden 은 이제 안 보낸다", model.contains("listHeaderHidden"))
        val svc = File("$root/HijackService.kt").readText()
        assertTrue(svc.contains("telemetryManager.openBlocked = openBlocked"))
        listOf("HAND_FIRST", "ALARM_HELD", "EVALUATING", "BUSY", "LIST_MOVING", "TAP_NOT_SENT").forEach { assertTrue(it, svc.contains("OpenBlocked.$it")) }
        assertTrue(svc.contains("🔔 [새로 셈]"))
        val plugin = File("$root/plugins/kakaopicker/KakaoPickerPlugin.kt").readText()
        assertTrue(plugin.contains("TapShift.listMoving("))
        assertEquals("보류 자리마다 열쇠를 남긴다", Regex("""return null""").findAll(plugin.substringAfter("override fun planListTap(").substringBefore("\n    /**")).count(),
            Regex("""lastHoldKey = (?!null)""").findAll(plugin.substringAfter("override fun planListTap(").substringBefore("\n    /**")).count())
    }
}
