package com.onedal.app.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * 🏷️ **로그 태그 — 원달앱과 서버·관제웹이 같은 열 낱말** (reviews/22 2단계 · 기사님 «시작해»)
 * 짝: `onedal-web/shared/src/logTags.ts` ↔ 원달앱 `LogTag.kt`. 한쪽만 바꾸면 여기서 빨갛다.
 */
class LogTagPairTest {

    private val shared = File("../../onedal-web/shared/src/logTags.ts").readText()

    @Test fun `원달앱 태그 낱말은 공유 목록과 같다 (순서까지)`() {
        val body = shared.substringAfter("LOG_TAGS = [").substringBefore("]")
        val words = Regex("""'([^']+)'""").findAll(body).map { it.groupValues[1] }.toList()
        assertTrue("공유 목록을 못 읽었다", words.isNotEmpty())
        assertEquals(words, LogTag.values().map { it.word })
    }

    @Test fun `태그 없음 표지도 같다`() {
        val noTag = Regex("""NO_TAG = '([^']+)'""").find(shared)!!.groupValues[1]
        assertEquals(noTag, LogTag.NO_TAG)
    }

    @Test fun `줄 모양 - 태그는 말머리 맨 앞 · 없으면 파일에서 없음 · 경고와 오류는 경고`() {
        assertEquals("#누름 👉 발사", AppLogger.tagged(LogTag.TAP, "👉 발사"))
        assertEquals("#없음 무엇", AppLogger.fileLine("D", null, "무엇"))
        assertEquals("#경고 무엇", AppLogger.fileLine("W", null, "무엇"))
        assertEquals("#경고 무엇", AppLogger.fileLine("E", null, "무엇"))
        assertEquals("#결재 무엇", AppLogger.fileLine("W", LogTag.DECISION, "무엇"))
    }

    /**
     * 🔕 **태그 없는 줄이 조용히 늘지 않는다** — 원달앱의 d · i · roadmap 호출은 모두 태그를 인다(계획서 «#없음 목표 0»).
     * W · E 는 로거가 «#경고»를 붙여 대상이 아니다. 서버 쪽 짝은 `logTagsCallSites`.
     */
    @Test fun `원달앱의 d · i · roadmap 호출은 모두 태그를 인다`() {
        val untagged = File("src/main/java/com/onedal/app").walkTopDown()
            .filter { it.extension == "kt" && it.name != "AppLogger.kt" }
            .flatMap { f ->
                val code = f.readText().replace(Regex("/\\*[\\s\\S]*?\\*/"), "").replace(Regex("//.*"), "")
                // 🔴 되짚기 막음 — 쉼표 «뒤» 빈칸까지 부정 탐색 안에 넣는다(아니면 빈칸 0개로 되짚어 태그 붙은 줄도 센다)
                val di = Regex("""AppLogger\.(d|i)\(\s*("[^"]*"|TAG)\s*,(?!\s*(com\.onedal\.app\.core\.)?LogTag\.)""").findAll(code)
                val rm = Regex("""AppLogger\.roadmap\((?!\s*(com\.onedal\.app\.core\.)?LogTag\.)""").findAll(code)
                (di + rm).map { "${f.name}: ${it.value.take(40)}" }
            }.toList()
        assertEquals("태그 없는 로그 호출 ${untagged.size}곳:\n${untagged.joinToString("\n")}", 0, untagged.size)
    }
}
