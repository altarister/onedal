package com.onedal.app.core

import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * 🎛️ **공급 모드를 받기 전에는 «도는 모드»를 싣지 않는다** (onedal-1f «가» · 모드는 관제앱이 블루투스로 준다 — reviews/50 ①-3).
 * 앱 서비스가 다시 붙으면 첫 보고가 기본값 MANUAL 로 나가, 서버가 «명령 AUTO → MANUAL 로 돈다» 거짓 줄을 남겼다.
 * 서버(devices.ts)는 빈 칸이면 건너뛴다. 앱 동작(응답 전 MANUAL)은 그대로다.
 */
class ModeFirstReportTest {
    private val src = File("src/main/java/com/onedal/app/core/TelemetryManager.kt").readText()

    @Test fun `받기 전 보고는 effectiveMode 가 비고 · 받으면 켠다`() {
        assertTrue(src.contains("effectiveMode = if (modeKnown) TargetApp.effectiveMode(currentMode, appCode) else null"))
        assertTrue(src.contains("private val modeKnown get() = suppliedMode != null"))
    }

    /** «받았다»(appliedMode)는 다음 보고에 실린다 — 홈 화면은 60초라 활성화 뒤 · 관제웹이 모드를 바꾼 뒤 «로딩 중 · 적용중»이 1분 돌았다. 못 잡는 것: 실제로 1초 안에 풀리는지(폰 · 관제웹) */
    @Test fun `처음이거나 모드가 바뀐 순간 한 번 더 보고한다 — 기다림 장부는 화면 스레드에서`() {
        val block = src.substringAfter("private fun recomputeMode(").substringBefore("\n    }\n")
        assertTrue(block.contains("if (next == currentMode) return"))
        assertTrue(block.contains("android.os.Handler(Looper.getMainLooper()).post { forceHeartbeat() }"))
    }
}
