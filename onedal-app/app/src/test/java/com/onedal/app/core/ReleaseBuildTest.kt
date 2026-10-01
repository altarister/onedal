package com.onedal.app.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * 📦 **배포판(release)만 실서버 · https 만 · 개발 도구 숨김 — 개발판(debug)은 그대로** (운영센터 4단계 앱 쪽 · onedal-1f «가»).
 * 서명 키 · signingConfig 는 기사님 손이라 안 건드린다. 🔴 지금 기사님 폰에 까는 길(installDebug · 로컬 PC 주소)이 바뀌면 안 된다.
 */
class ReleaseBuildTest {
    private val gradle = File("build.gradle.kts").readText()
    private fun block(name: String) = gradle.substringAfter("$name {").substringBefore("\n        }")

    @Test fun `🔴 debug 는 로컬 PC · http 허용 그대로 · release 는 실서버 · https 만 · 서명·minify 안 건드림`() {
        val debug = block("debug"); val release = block("release")
        assertTrue(debug.contains("buildConfigField(\"boolean\", \"LIVE_DEFAULT\", \"false\")"))
        assertTrue(debug.contains("manifestPlaceholders[\"usesCleartext\"] = \"true\""))
        assertTrue(release.contains("buildConfigField(\"boolean\", \"LIVE_DEFAULT\", \"true\")"))
        assertTrue(release.contains("manifestPlaceholders[\"usesCleartext\"] = \"false\""))
        assertTrue(release.contains("isMinifyEnabled = false"))
        assertFalse(gradle.contains("signingConfig"))
        val manifest = File("src/main/AndroidManifest.xml").readText()
        assertTrue(manifest.contains("android:usesCleartextTraffic=\"\${usesCleartext}\""))
    }

    @Test fun `서버 기본값은 한 곳 - ServerTarget`() {
        val root = "src/main/java/com/onedal/app"
        listOf("api/ApiClient.kt", "ui/MainViewModel.kt").forEach { f ->
            assertFalse(f, File("$root/$f").readText().contains("getBoolean(\"isLiveMode\""))
        }
        assertTrue(File("$root/core/ServerTarget.kt").readText().contains("prefs.getBoolean(\"isLiveMode\", BuildConfig.LIVE_DEFAULT)"))
    }

    @Test fun `시험 도구 셋은 개발판에서만`() {
        val s = File("src/main/java/com/onedal/app/ui/SettingsScreen.kt").readText()
        assertEquals("PC 주소 · 터치 표시 · 사진 시험", 3, Regex("if \\(BuildConfig\\.DEBUG\\)").findAll(s).count())
    }

    @Test fun `업데이트 안내 - 칸 없으면 없음 · 같으면 없음 · 최신보다 낮으면 있음 · 최소보다 낮으면 해야 씀`() {
        assertNull(UpdateNotice.of(59, null, null))
        assertNull(UpdateNotice.of(59, 59, 58))
        assertEquals(UpdateNotice.Kind.AVAILABLE, UpdateNotice.of(59, 60, 58)!!.kind)
        assertEquals(UpdateNotice.Kind.REQUIRED, UpdateNotice.of(57, 60, 58)!!.kind)
        val m = File("src/main/java/com/onedal/app/models/SharedModels.kt").readText()
        assertTrue(m.contains("val appLatestCode: Int? = null") && m.contains("val appMinimumCode: Int? = null"))
    }

    @Test fun `짝 맺기 403 은 한글`() {
        assertEquals("승인 전이거나 이용이 멈춘 계정입니다", DeviceLink.pairErrorText("ACCOUNT_BLOCKED"))
        assertEquals("PIN 이 맞지 않거나 시간이 지났습니다", DeviceLink.pairErrorText("PIN_INVALID"))
        assertEquals("다른 까닭", DeviceLink.pairErrorText("다른 까닭"))
    }
}
