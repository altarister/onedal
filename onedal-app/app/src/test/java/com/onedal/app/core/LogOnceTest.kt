package com.onedal.app.core

import org.junit.Assert.assertEquals
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
        assertTrue(Regex("""LogOnce\.changed\([^)]*\)\)\s*AppLogger\.d\(TAG,\s*(LogTag\.\w+,\s*)?"⏭️ \[이미 본 콜\]""").containsMatchIn(svc))
        assertTrue(Regex("""LogOnce\.changed\("screen"""").containsMatchIn(svc))
        assertTrue(codeOnly("$root/plugins/insung/InsungParser.kt").contains("LogOnce.changed("))
        assertTrue(codeOnly("$root/plugins/hwamul24/Hwamul24Parser.kt").contains("LogOnce.changed("))
    }

    /** 📤 «콜 0건» 보고는 화면이 바뀔 때만 한 줄 — 상세 대기 중 매초 «콜 0건»이 찍혀 하루 2,440줄이었다(09-30) */
    @Test fun `scrap 줄 - 콜이 있으면 늘 · 0건은 화면이 바뀔 때만`() {
        LogOnce.changed("scrap-empty", "")   // 다른 검사의 기억을 비운다
        assertEquals("📤 [scrap] 화면 DETAIL_PRE_CONFIRM · 콜 0건 · 30ms", com.onedal.app.api.scrapLogLine("DETAIL_PRE_CONFIRM", 0, 30))
        assertEquals(null, com.onedal.app.api.scrapLogLine("DETAIL_PRE_CONFIRM", 0, 12))
        assertEquals("📤 [scrap] 화면 LIST · 콜 3건 · 20ms", com.onedal.app.api.scrapLogLine("LIST", 3, 20))
        assertEquals("📤 [scrap] 화면 LIST · 콜 2건 · 21ms", com.onedal.app.api.scrapLogLine("LIST", 2, 21))
        assertEquals("📤 [scrap] 화면 LIST · 콜 0건 · 9ms", com.onedal.app.api.scrapLogLine("LIST", 0, 9))
    }

    /** 📐 4토막 줄은 카드 자리(top)가 아니라 조립 결과가 바뀔 때만 — 스크롤만 해도 같은 카드가 다시 찍혀 하루 1,654줄이었다(09-30) */
    @Test fun `4토막 줄은 조립 결과가 바뀔 때만`() {
        val picker = codeOnly("$root/plugins/kakaopicker/KakaoPickerParser.kt")
        assertTrue(picker.contains("""LogOnce.changed("picker-4piece:${'$'}{texts.joinToString(" ")}", "${'$'}pickup|${'$'}dropoff")"""))
    }
}
