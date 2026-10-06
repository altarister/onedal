package com.onedal.app.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * 🔒 **«서버가 앞 콜을 심사 중»은 응답 맨 위 칸이 먼저** (onedal-ab 원인 · 1f «가» · 라이브 09-30 21:36).
 * 필터 안의 evaluatingNow 가 상세 중 true · 목록 false 로 갈려 필터 버전이 30초마다 바뀌었다.
 * 서버는 버전을 이 칸 뺀 필터로 만들고 맨 위 칸으로 늘 싣는다 — 앱이 먼저 맨 위를 읽어야 본문이 생략된 응답에서도 옛 값에 갇히지 않는다.
 */
class EvaluatingNowTest {
    @Test fun `맨 위 true · 필터 안 false 면 true`() = assertTrue(EvaluatingNow.of(top = true, inFilter = false))
    @Test fun `맨 위 false · 필터 안 true 면 false`() = assertFalse(EvaluatingNow.of(top = false, inFilter = true))
    @Test fun `맨 위 없으면 필터 안 값`() {
        assertTrue(EvaluatingNow.of(top = null, inFilter = true))
        assertFalse(EvaluatingNow.of(top = null, inFilter = false))
    }
    @Test fun `관제앱 PHONE 의 심사 중을 맨 위 칸 저장에 넣고 클릭 미룸이 그것을 먼저 읽는다`() {
        val root = "src/main/java/com/onedal/app"
        assertTrue(File("$root/HijackService.kt").readText().contains("putBoolean(com.onedal.app.core.EvaluatingNow.PREF_KEY, j.optBoolean(\"evaluatingNow\"))"))
        assertTrue(File("$root/HijackService.kt").readText().contains("EvaluatingNow.of("))
    }
}
