package com.onedal.app.core

import com.onedal.app.models.ScreenContext
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * 👆 **KEEP 결재 뒤 «닫기»는 기사님 손이 상세에 있으면 최대 3초 기다린다** (기사님 «알아서» → onedal-e7 · onedal-1f «가»).
 * 앱이 손을 안 보고 0.5초 뒤 «닫기»를 눌러, 상세를 보거나 만지던 기사님 화면이 목록으로 튕겼다. CANCEL «취소»는 계약 보호라 그대로.
 * 기다렸다 누를 때는 화면을 다시 본다 — 그사이 상세를 떠났거나(기사님이 직접 닫음) 다른 콜이면 누르지 않는다.
 */
class KeepCloseWaitTest {
    @Test fun `손 없으면 지금 · 손 0_3초 전이면 0_7초 뒤 · 계속 손이면 3초에서 누름`() {
        assertNull(KeepCloseWait.waitMs(nowMs = 10_000, firstAtMs = 10_000, lastHandAtMs = 0))
        assertEquals(700L, KeepCloseWait.waitMs(nowMs = 10_000, firstAtMs = 10_000, lastHandAtMs = 9_700))
        assertEquals("3초까지 남은 만큼만", 500L, KeepCloseWait.waitMs(nowMs = 12_500, firstAtMs = 10_000, lastHandAtMs = 12_400))
        assertNull("3초가 지나면 누른다", KeepCloseWait.waitMs(nowMs = 13_000, firstAtMs = 10_000, lastHandAtMs = 12_900))
    }

    @Test fun `기다리는 사이 상세를 떠났거나 다른 콜이면 건너뜀`() {
        val d = ScreenContext.DETAIL_CONFIRMED
        assertNull(KeepCloseWait.skipWhy(d, d, "o1", "o1"))
        assertTrue(KeepCloseWait.skipWhy(d, ScreenContext.LIST, "o1", "o1")!!.contains("상세를 떠남"))
        assertTrue(KeepCloseWait.skipWhy(d, d, "o1", "o2")!!.contains("다른 콜"))
        assertTrue(KeepCloseWait.skipWhy(d, d, "o1", "")!!.contains("다른 콜"))
    }

    @Test fun `KEEP 만 기다리고 · 상세 안 누름·스크롤이 손 시각을 적고 · 이름은 결재 버튼`() {
        val src = File("src/main/java/com/onedal/app/HijackService.kt").readText()
        assertTrue(src.contains("waitBook.schedule(\"결재 버튼\""))
        assertTrue(src.contains("if (decision == \"KEEP\") KeepCloseWait.waitMs("))
        assertTrue(src.contains("⏭️ [닫기 건너뜀]"))
        assertEquals("상세 안 누름·스크롤 두 곳", 2, Regex("(?<!var )lastDetailHandAtMs = ").findAll(src).count())
    }
}
