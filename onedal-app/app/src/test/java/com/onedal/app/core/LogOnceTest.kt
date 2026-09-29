package com.onedal.app.core

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/** 🔕 같은 말을 되풀이하지 않는다 — 로그 줄이기 ①-3 (reviews/22 · 기사님 «시작해») */
class LogOnceTest {

    @Test fun `같은 글자는 한 번만 - 바뀌면 다시`() {
        assertTrue(LogOnce.changed("t1:call", "통과"))
        assertFalse(LogOnce.changed("t1:call", "통과"))
        assertTrue(LogOnce.changed("t1:call", "차단"))
    }

    @Test fun `기억은 최근 MAX 개 - 넘으면 오래된 열쇠를 잊어 다시 찍는다`() {
        assertTrue(LogOnce.changed("t2:first", "a"))
        for (i in 0 until LogOnce.MAX) LogOnce.changed("t2:k$i", "a")
        assertTrue(LogOnce.changed("t2:first", "a"))
    }

    private fun codeOnly(path: String) = File(path).readText()
        .replace(Regex("/\\*[\\s\\S]*?\\*/"), "").replace(Regex("//.*"), "")
    private val root = "src/main/java/com/onedal/app"

    @Test fun `scrap 보고는 한 줄 - 보내기·응답 공통 줄을 조용히 부른다 (실패 줄은 남는다)`() {
        val api = codeOnly("$root/api/ApiClient.kt")
        assertTrue(Regex("""executeWithRetry\([^)]*"/scrap"[^)]*quiet\s*=\s*true""").containsMatchIn(api))
        assertTrue("실패 줄이 없다", api.contains("[HTTP 실패]"))
        assertFalse("전송 직전 해시 검사 줄이 남아 있다", codeOnly("$root/core/TelemetryManager.kt").contains("해시값 검사 및 디바운스"))
    }

    @Test fun `되풀이 줄은 LogOnce 를 거친다 - 이미 본 콜 · 화면 변경 · 목록 필터 판정`() {
        val svc = codeOnly("$root/HijackService.kt")
        assertTrue(Regex("""LogOnce\.changed\([^)]*\)\)\s*AppLogger\.d\(TAG,\s*"⏭️ \[이미 본 콜\]""").containsMatchIn(svc))
        assertTrue(Regex("""LogOnce\.changed\("screen"""").containsMatchIn(svc))
        assertTrue(codeOnly("$root/plugins/insung/InsungParser.kt").contains("LogOnce.changed("))
        assertTrue(codeOnly("$root/plugins/hwamul24/Hwamul24Parser.kt").contains("LogOnce.changed("))
    }
}
