package com.onedal.app.core

import com.onedal.app.models.ScreenContext
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * 🔐 **기기 비밀 토큰 · 연결 풀림** (운영센터 1단계 · reviews/29 · onedal-ab 이름 · onedal-1f «가»).
 * 폰 이름(«앱폰-기종-100~999»)만으로 자기를 밝혀, 같은 기종 두 폰이 겹치거나 남이 대입할 수 있었다.
 * 짝 때 받은 토큰을 요청마다 `X-Device-Token` 으로 싣고, 서버가 거절하면 띠를 띄우고 보고를 늦춘다.
 */
class DeviceLinkTest {
    @Test fun `거절 판정 - 토큰 틀림·연결 안 됨은 연결 풀림 · 계정 막힘 · PIN 틀림은 띠 아님`() {
        assertEquals(DeviceLink.Verdict.OK, DeviceLink.verdict(200, "{}"))
        assertEquals(DeviceLink.Verdict.UNLINKED, DeviceLink.verdict(401, """{"error":"DEVICE_TOKEN_INVALID"}"""))
        assertEquals(DeviceLink.Verdict.UNLINKED, DeviceLink.verdict(401, """{"error":"DEVICE_NOT_PAIRED"}"""))
        assertEquals(DeviceLink.Verdict.BLOCKED, DeviceLink.verdict(403, """{"error":"ACCOUNT_BLOCKED"}"""))
        assertEquals(DeviceLink.Verdict.OTHER, DeviceLink.verdict(401, """{"error":"PIN_INVALID"}"""))
        assertEquals(DeviceLink.Verdict.OTHER, DeviceLink.verdict(500, null))
    }

    @Test fun `식별 id 는 d- 와 UUID · 부를 때마다 다르다`() {
        val a = DeviceLink.newDeviceId()
        assertTrue(a, Regex("^d-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$").matches(a))
        assertTrue(a != DeviceLink.newDeviceId())
    }

    @Test fun `띠 글`() {
        assertEquals("폰 연결이 끊겼습니다 — 다시 연결", DeviceLink.bannerOf(DeviceLink.WHY_UNLINKED))
        assertEquals("이용이 멈췄습니다", DeviceLink.bannerOf(DeviceLink.WHY_BLOCKED))
        assertNull(DeviceLink.bannerOf(null))
    }

    @Test fun `연결이 풀리면 결재 대기·목록이어도 60초`() {
        assertEquals(60_000L, TelemetryManager.heartbeatIntervalMs(waitingDecision = true, screen = ScreenContext.LIST, unlinked = true))
        assertEquals(15_000L, TelemetryManager.heartbeatIntervalMs(waitingDecision = false, screen = ScreenContext.LIST, unlinked = false))
    }

    @Test fun `요청은 한 곳에서 열고 토큰을 싣는다 · 짝 응답 토큰을 저장한다 · 이름이 비면 기종`() {
        val api = File("src/main/java/com/onedal/app/api/ApiClient.kt").readText()
        assertEquals("openConnection 은 한 곳", 1, Regex("openConnection\\(").findAll(api).count())
        assertTrue(api.contains("setRequestProperty(DeviceLink.HEADER, it)"))
        assertTrue(api.contains("resultObj?.deviceToken"))
        assertTrue(api.contains("?: Build.MODEL"))
        assertTrue(api.contains("DeviceLink.newDeviceId()"))
        val models = File("src/main/java/com/onedal/app/models/SharedModels.kt").readText()
        assertTrue(models.contains("val deviceToken: String? = null"))
        val tm = File("src/main/java/com/onedal/app/core/TelemetryManager.kt").readText()
        assertTrue(tm.contains("heartbeatIntervalMs(isWaitingDecision, currentScreenContext, apiClient.isUnlinked())"))
        val dash = File("src/main/java/com/onedal/app/ui/DashboardScreen.kt").readText()
        assertTrue(dash.contains("DeviceLink.bannerOf(viewModel.unlinkedWhy)"))
    }
}
