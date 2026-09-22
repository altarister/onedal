package com.onedal.app.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * 🧹 **로그 파일을 «지우는 규칙»을 잠근다**.
 *
 * 파일 로그를 만든 이유가 *"로그가 조용히 사라져서 08:22 을 못 봤다"* 인데,
 * **지우는 쪽이 틀리면 만든 보람이 없다.** 그래서 고르는 일만 순수 함수로 떼어 검사한다.
 *
 * 🔴 남의 파일을 지우지 않는 것도 여기서 잠근다 — 09-13 백업 중에 기사님이 찍으신
 *    사진 37장을 지운 일이 있었다. **내 것만 고른다.**
 */
class LogFileSinkTest {

    @Test
    fun `새것 다섯을 남기고 나머지를 고른다 - 이름순이 곧 시간순이다`() {
        val names = listOf(
            "1dal-2026-09-08.log", "1dal-2026-09-09.log", "1dal-2026-09-10.log",
            "1dal-2026-09-11.log", "1dal-2026-09-12.log", "1dal-2026-09-13.log",
        )
        assertEquals(listOf("1dal-2026-09-08.log"), LogFileSink.expiredNames(names, keep = 5))
    }

    @Test
    fun `다섯 이하면 아무것도 안 지운다`() {
        val names = listOf("1dal-2026-09-12.log", "1dal-2026-09-13.log")
        assertTrue(LogFileSink.expiredNames(names, keep = 5).isEmpty())
    }

    @Test
    fun `우리 것이 아닌 파일은 절대 고르지 않는다`() {
        val names = listOf(
            "1dal-2026-09-01.log", "1dal-2026-09-02.log", "1dal-2026-09-03.log",
            "Screenshot_20260913_082215.jpg",   // 기사님이 찍으신 사진
            "logcat.txt", "주행로그.zip", "1dal-메모.md",
        )
        val doomed = LogFileSink.expiredNames(names, keep = 1)
        assertEquals(listOf("1dal-2026-09-02.log", "1dal-2026-09-01.log"), doomed)
    }

    @Test
    fun `달과 해가 넘어가도 순서가 맞는다 - 이름이 0 을 채운 날짜라서다`() {
        val names = listOf(
            "1dal-2025-12-31.log", "1dal-2026-01-01.log", "1dal-2026-01-09.log",
            "1dal-2026-01-10.log",
        )
        assertEquals(
            listOf("1dal-2026-01-01.log", "1dal-2025-12-31.log"),
            LogFileSink.expiredNames(names, keep = 2),
        )
    }
}
