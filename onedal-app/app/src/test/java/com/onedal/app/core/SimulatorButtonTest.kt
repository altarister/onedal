package com.onedal.app.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * 🧪 **설정 화면 «테스트 가상 콜 화면 열기»는 시뮬레이터 앱을 켠다** (원달앱 계획서 ①)
 *
 * 이 버튼은 브라우저로 `map.altari.com/inseong` 을 열었다. 그 주소는 열리지만 **다른 프로젝트의
 * 지도 게임**이 뜬다 (기사님 확인 2026-09-14) — 시뮬레이터는 2026-08-22 에 `onedal-sim` 으로 옮겨 왔다.
 * 그리고 우리 시뮬레이터는 브라우저로 열면 안 된다 — 접근성 트리에 웹 글자가 제대로 안 올라와서
 * 앱(`com.onedal.simulator`)으로 감쌌다 (onedal-sim/README.md).
 *
 * 안드로이드 11 이상에서 다른 앱을 켜려면 매니페스트에 그 앱을 적어 둬야 한다(`<queries>`).
 * 안 적으면 `getLaunchIntentForPackage` 가 조용히 null 을 준다 — 버튼이 아무 일도 안 하는 것처럼 보인다.
 */
class SimulatorButtonTest {

    private fun codeOnly(path: String) = File(path).readText()
        .replace(Regex("/\\*[\\s\\S]*?\\*/"), "").replace(Regex("//.*"), "")

    @Test
    fun `시뮬레이터 앱 이름은 한 곳에 산다`() {
        assertEquals("com.onedal.simulator", TargetApp.SIMULATOR_PACKAGE)
    }

    @Test
    fun `🔴 매니페스트가 시뮬레이터 앱을 찾을 수 있게 적어 둔다 - 안 적으면 버튼이 조용히 먹통`() {
        val manifest = File("src/main/AndroidManifest.xml").readText()
        assertTrue(Regex("""<queries>[\s\S]*<package\s+android:name="com\.onedal\.simulator"\s*/>[\s\S]*</queries>""").containsMatchIn(manifest))
    }

    @Test
    fun `🔴 설정 화면에서 더 이상 가상콜 화면 열기 버튼을 두지 않는다 - 기사님 요청으로 삭제`() {
        val src = codeOnly("src/main/java/com/onedal/app/ui/SettingsScreen.kt")
        assertFalse(src.contains("map.altari.com"))
        assertFalse(src.contains("테스트 가상 콜 화면 열기"))
    }
}
