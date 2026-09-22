package com.onedal.app.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * 🧪 **설정 화면에는 «테스트 가상 콜 화면 열기» 버튼을 두지 않는다 — 시뮬레이터는 따로 켜는 앱이다**
 *
 * 그 버튼이 열던 브라우저 주소 `map.altari.com/inseong` 에는 **다른 프로젝트의 지도 게임**이 뜬다.
 * 시뮬레이터는 `onedal-sim` 이고, 브라우저로 열면 접근성 트리에 웹 글자가 제대로 안 올라와서
 * 앱(`com.onedal.simulator`)으로 감쌌다 (onedal-sim/README.md).
 *
 * 매니페스트의 `<queries>` 에는 시뮬레이터 앱을 적어 둔다 — 안드로이드 11 이상에서 다른 앱을 찾으려면
 * 거기 적혀 있어야 하고, 안 적으면 `getLaunchIntentForPackage` 가 조용히 null 을 준다.
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
