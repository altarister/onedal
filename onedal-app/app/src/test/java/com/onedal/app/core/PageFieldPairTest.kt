package com.onedal.app.core

import com.google.gson.JsonParser
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * 📄 **페이지 · 칸 · 글자 갈래 이름 — 원달앱과 서버·관제웹이 같은 낱말** (로그 태그 짝과 같은 모양).
 * 짝: `onedal-web/shared/src/network/pageFields.ts`(기준 페이지 사전 — 칸을 적는 페이지는 `pages` 열쇠에서 홈을 뺀 것) ↔ 원달앱 `PageField.kt`. 한쪽만 바꾸면 여기서 빨갛다.
 */
class PageFieldPairTest {
    private val shared = File("../../onedal-web/shared/src/network/pageFields.ts").readText()

    private fun wordsOf(name: String): List<String> {
        val body = shared.substringAfter("$name = [").substringBefore("] as const")
            .lines().joinToString("\n") { it.substringBefore("//") }
        return Regex("""'([^']+)'""").findAll(body).map { it.groupValues[1] }.toList()
    }

    /** 사전 JSON 표시 사이의 `pages` 열쇠 차례에서 홈을 뺀 것 — 칸을 적는 페이지(홈은 콜 자료가 없어 칸을 안 적는다) */
    private fun screenPages(): List<String> {
        val body = Regex("""/\*JSON\*/([\s\S]*?)/\*JSON\*/""").find(shared)?.groupValues?.get(1) ?: error("pageFields.ts 에서 /*JSON*/ 표시 사이를 못 찾았다")
        return JsonParser.parseString(body).asJsonObject["pages"].asJsonObject.keySet().filter { it != "home" }
    }

    @Test fun `페이지 낱말이 같다 (차례까지)`() {
        val w = screenPages()
        assertTrue("공유 목록을 못 읽었다", w.isNotEmpty())
        assertEquals(w, Page.values().map { it.word })
    }

    @Test fun `글자 갈래 낱말이 같다`() = assertEquals(wordsOf("WORD_KINDS"), WordKind.values().map { it.word })

    @Test fun `칸 이름이 같다 (차례까지)`() {
        val w = wordsOf("PAGE_FIELDS")
        assertTrue("공유 목록을 못 읽었다", w.size >= 10)
        assertEquals(w, PageField.values().map { it.word })
    }
}
