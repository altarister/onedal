package com.onedal.app.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * 👆 **맨 아래 줄은 탭 줄 위로 보이는 몫의 가운데를 누른다 — 모자라면 보류** (onedal-1f «가»).
 * 라이브 09-30 23:20~23:50 «누르기 안 먹힘» 12번이 모두 Y=2102 — 아래 탭 줄 위끝이 Y=2100(«📏 [아래 탭 줄]»)이라 앱이 누른 곳은 탭 줄이었다.
 * 8,393 줄: 태그 줄 위끝 2042 · 아랫줄 위끝 2102 · 요금 칸 위끝 2069 · 중심 2102(«📐 [4토막 조립]» 23:32:21).
 */
class TabLineTapTest {
    @Test fun `오늘 8,393 줄 - 선 위로 보이는 몫 18px 라 보류`() =
        assertNull(TapShift.rowTapDy(fareCenterY = 2102, rowTopY = 2042, tabTopY = 2100))

    @Test fun `보이는 몫이 넉넉하면 그 가운데로 옮긴다`() {
        // 선 = 2100 − 40 = 2060 · 줄 위끝 1960 → 보이는 몫 100 · 가운데 2010 · 요금 중심 2069 에서 −59
        assertEquals(-59, TapShift.rowTapDy(fareCenterY = 2069, rowTopY = 1960, tabTopY = 2100))
    }

    @Test fun `선 위의 줄은 그대로`() = assertEquals(0, TapShift.rowTapDy(fareCenterY = 1776, rowTopY = 1716, tabTopY = 2100))

    @Test fun `탭 줄을 모르면 지금처럼`() = assertEquals(0, TapShift.rowTapDy(fareCenterY = 2102, rowTopY = 2042, tabTopY = null))

    @Test fun `플러그인이 선을 부르고 누르기가 dy 를 넘긴다`() {
        val root = "src/main/java/com/onedal/app"
        val plugin = File("$root/plugins/kakaopicker/KakaoPickerPlugin.kt").readText()
        assertTrue(plugin.contains("TapShift.rowTapDy("))
        assertTrue(plugin.contains("탭 줄에 걸림"))
        assertTrue(File("$root/HijackService.kt").readText().contains("tapDy = tap2.dy"))
        assertTrue(File("$root/core/AutoTouchManager.kt").readText().contains("rect.centerY() + tapDy"))
    }

    /** 내려간 목록 길도 같은 선 — 라이브 10-01 01:02:56 6,622 «요금 Y=2045» 가 선(2060) 안이라 통과했는데 안 먹혔다(보이는 몫 가운데를 안 눌렀다) */
    @Test fun `내려간 목록 길도 탭 줄 선으로 누를 Y 를 정한다`() {
        val plugin = File("src/main/java/com/onedal/app/plugins/kakaopicker/KakaoPickerPlugin.kt").readText()
        val scrolled = plugin.substringAfter("private fun planScrolledTap(").substringBefore("\n    companion object")
        assertTrue("두 길이 같은 도우미", scrolled.contains("tabLineDy("))
        assertTrue(scrolled.contains("dy = dy"))
        assertTrue(plugin.substringAfter("private fun tabLineDy(").substringBefore("\n    }").contains("TapShift.rowTapDy("))
    }
}
