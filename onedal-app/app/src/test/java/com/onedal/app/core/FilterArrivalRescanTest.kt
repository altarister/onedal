package com.onedal.app.core

import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * 🔄 **새 필터가 폰에 닿으면 지금 목록을 곧바로 다시 판정한다** (실물 픽커 첫 판 09-30 02:52 · onedal-1f «가»)
 * 목록 글자가 그대로면 화면 알림에서 스캔 전에 돌아서, 기사님이 필터를 바꿔도 떠 있는 콜이 다시 판정되지 않았다(좋은 콜 손실).
 * 목록일 때만 곧바로 — 상세·팝업에서는 목록으로 돌아오는 순간 목록 스캔 첫머리(`onFilterVersion`)가 받는다.
 */
class FilterArrivalRescanTest {

    private fun codeOnly(path: String) = File(path).readText()
        .replace(Regex("/\\*[\\s\\S]*?\\*/"), "").replace(Regex("//.*"), "")
    private val root = "src/main/java/com/onedal/app"
    private val api = codeOnly("$root/api/ApiClient.kt")
    private val svc = codeOnly("$root/HijackService.kt")
    private val hook = svc.substringAfter("apiClient.onFilterChanged =").substringBefore("\n        }\n")

    @Test fun `필터 버전이 바뀔 때만 알린다 - 막 켜져 이전 버전이 없으면 안 부른다`() {
        assertTrue(api.contains("onFilterChanged?.invoke("))
        assertTrue(Regex("""!prevFilterVersion\.isNullOrEmpty\(\)\s*&&\s*\w+\s*!=\s*prevFilterVersion""").containsMatchIn(api))
    }

    @Test fun `목록일 때만 지문을 비우고 한 번 다시 읽는다`() {
        assertTrue("필터 도착을 받는 자리가 없다", svc.contains("apiClient.onFilterChanged ="))
        assertTrue(hook.contains("ScreenContext.LIST"))
        assertTrue(hook.contains("lastScreenFingerprint = 0"))
        assertTrue(hook.contains("scanScreen("))
    }

    @Test fun `목록이 아니면 다시 읽지 않고 한 줄만 남긴다`() =
        assertTrue(hook.contains("목록으로 돌아오면 판정한다"))

    @Test fun `스캔 입구는 하나 - 화면 알림도 같은 함수를 부른다`() {
        val onEvent = svc.substringAfter("override fun onAccessibilityEvent(").substringBefore("private fun scanScreen(")
        assertTrue(onEvent.contains("scanScreen("))
        assertTrue(svc.contains("private fun scanScreen("))
    }
}
