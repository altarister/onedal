package com.onedal.app.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * 🔒 **«서버가 앞 콜을 심사 중»은 응답 맨 위 칸이 먼저** (onedal-ab 원인 · 1f «가» · 라이브).
 * 필터 안의 evaluatingNow 가 상세 중 true · 목록 false 로 갈려 필터 버전이 30초마다 바뀌었다.
 * 서버는 버전을 이 칸 뺀 필터로 만들고 맨 위 칸으로 늘 싣는다 — 앱이 먼저 맨 위를 읽어야 본문이 생략된 응답에서도 옛 값에 갇히지 않는다.
 */
class EvaluatingNowTest {
    @Test fun `맨 위 true · 필터 안 false 면 true`() = assertTrue(EvaluatingNow.of(top = true, inFilter = false, trusted = true))
    @Test fun `맨 위 false · 필터 안 true 면 false`() = assertFalse(EvaluatingNow.of(top = false, inFilter = true, trusted = true))
    @Test fun `맨 위 없으면 필터 안 값`() {
        assertTrue(EvaluatingNow.of(top = null, inFilter = true, trusted = true))
        assertFalse(EvaluatingNow.of(top = null, inFilter = false, trusted = true))
    }

    /* 🔓 끊긴 동안 저장된 «심사 중»은 믿지 않는다 (29 X5 · X6 ② 가) — 믿을 수 없으면 «심사 중 아님» */
    @Test fun `믿을 수 없으면 저장된 심사 중이 참이어도 아니다`() {
        assertFalse(EvaluatingNow.of(top = true, inFilter = true, trusted = false))
    }
    @Test fun `서비스가 뜬 뒤 이 폰 몫을 한 번도 못 받았으면 못 믿는다 - 다시 뜸`() {
        assertFalse(EvaluatingNow.trusted(heardSinceStart = false, linked = true, serverAlive = true, replying = true))
    }
    @Test fun `블루투스와 관제앱 서버가 살아 있으면 믿는다`() {
        assertTrue(EvaluatingNow.trusted(heardSinceStart = true, linked = true, serverAlive = true, replying = false))
    }
    @Test fun `블루투스가 끊겨도 원달앱 인터넷이 서버에 닿으면 믿는다 - 인터넷 길이 1초마다 새 값`() {
        assertTrue(EvaluatingNow.trusted(heardSinceStart = true, linked = false, serverAlive = false, replying = true))
    }
    @Test fun `공급과 인터넷이 모두 끊기면 못 믿는다`() {
        assertFalse(EvaluatingNow.trusted(heardSinceStart = true, linked = false, serverAlive = false, replying = false))
        assertFalse(EvaluatingNow.trusted(heardSinceStart = true, linked = true, serverAlive = false, replying = false))
    }
    @Test fun `관제앱 PHONE 의 심사 중을 맨 위 칸 저장에 넣고 클릭 미룸이 그것을 먼저 읽는다`() {
        val root = "src/main/java/com/onedal/app"
        assertTrue(File("$root/HijackService.kt").readText().contains("putBoolean(com.onedal.app.core.EvaluatingNow.PREF_KEY, j.optBoolean(com.onedal.app.core.EvaluatingNow.KEY))"))
        assertTrue(File("$root/HijackService.kt").readText().contains("EvaluatingNow.of("))
    }
}
