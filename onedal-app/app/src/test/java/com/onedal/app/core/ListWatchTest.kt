package com.onedal.app.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * 📜 **조용한 목록 다시 읽기** — 픽커가 알림을 안 내면 서비스 캐시가 안 버려져 옛 틀이 남는다(16:18 · 18:45 · 19:46).
 * 목록에서 5초 넘게 읽기도 배차망 알림도 없으면 캐시를 비우고 한 번 읽는다. 기사님이 목록을 만지는 중(스크롤 알림)에는 끼어들지 않는다.
 */
class ListWatchTest {
    private fun read(now: Long, lastRead: Long = 0, lastEvent: Long = 0, list: Boolean = true, busy: Boolean = false) =
        ListWatch.shouldRead(now, lastRead, lastEvent, list, busy)

    @Test fun `목록에서 읽기도 알림도 5초 넘게 없으면 읽는다`() = assertTrue(read(now = 10_000, lastRead = 4_000, lastEvent = 4_500))

    @Test fun `기사님이 목록을 만지는 중 - 스크롤 알림 1초 전이면 안 끼어든다`() = assertFalse(read(now = 10_000, lastRead = 4_000, lastEvent = 9_000))

    @Test fun `마지막 읽기가 5초 안이면 안 읽는다`() = assertFalse(read(now = 10_000, lastRead = 6_000, lastEvent = 1_000))

    @Test fun `상세·다른 화면 · 누름 대기 중에는 안 읽는다`() {
        assertFalse(read(now = 10_000, list = false))
        assertFalse(read(now = 10_000, busy = true))
    }

    @Test fun `틀을 버리면 500ms 뒤 한 번 · 세 번 연달아면 5초 주기로`() {
        assertEquals(500L, ListWatch.afterDiscard(1))
        assertEquals(500L, ListWatch.afterDiscard(2))
        assertNull(ListWatch.afterDiscard(3))
    }

    @Test fun `요약 줄 - 조용한 다시 읽기 횟수와 훑기`() {
        val s = ScanTimer()
        s.record(420, true, 0, walkMs = 380, quietRead = true)
        assertEquals("1000ms 동안 1번(같은 글자 1) · 평균 420ms · 최대 420ms · 합 420ms · 훑기 합 380ms · 조용한 다시 읽기 1번(훑기 380ms)",
            s.tick(1000, force = false))
    }

    /** 설치 직후 «알림 없이 1083265초»(마지막 읽기·알림 시각 0 · 폰이 켜진 뒤 시간)로 찍혔다(실물 20:02:22) */
    @Test fun `로그 글 - 붙은 뒤 읽기도 알림도 없었으면 초가 아니라 붙은 뒤 첫 읽기`() {
        assertEquals("붙은 뒤 첫 읽기", ListWatch.quietWord(nowMs = 1_083_265_000, lastReadMs = 0, lastEventMs = 0))
        assertEquals("알림 없이 6초", ListWatch.quietWord(nowMs = 10_000, lastReadMs = 4_000, lastEventMs = 3_000))
    }
}
