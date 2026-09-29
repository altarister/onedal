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
}
