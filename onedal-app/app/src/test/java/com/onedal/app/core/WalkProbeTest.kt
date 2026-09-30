package com.onedal.app.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * 🧪 **나무 훑기 계측 — 미리 받기(prefetch) 번갈아 재기 · 캐시 낡음 확인** (실물 09-30 18:45 · 같은 훑기가 11ms~930ms · onedal-1f «가»).
 * - 목록 읽기마다 기본/미리 받기를 번갈아 쓴다(읽는 노드는 같다) · SDK 33 미만은 늘 기본
 * - 알림 없이 5초 넘은 목록 읽기 가운데 30초에 한 번까지만 캐시를 비우고 다시 읽어 글자가 달라지는지 본다 · 누름이 걸려 있으면 안 한다
 */
class WalkProbeTest {
    @Test fun `방식 - SDK 33 미만은 늘 기본 · 그 위는 홀짝 번갈아`() {
        assertEquals(WalkProbe.Way.PLAIN, WalkProbe.wayFor(sdk = 32, readNo = 2))
        assertEquals(WalkProbe.Way.PLAIN, WalkProbe.wayFor(sdk = 36, readNo = 1))
        assertEquals(WalkProbe.Way.PREFETCH, WalkProbe.wayFor(sdk = 36, readNo = 2))
    }

    @Test fun `캐시 확인 - 목록 · 알림 없이 5초 · 30초에 한 번 · 누름 대기 아님`() {
        fun probe(now: Long, lastEvent: Long = 0, lastProbe: Long = Long.MIN_VALUE / 2, list: Boolean = true, busy: Boolean = false, sdk: Int = 36) =
            WalkProbe.shouldProbeCache(sdk, now, lastEvent, lastProbe, list, busy)
        assertTrue(probe(now = 5000))
        assertFalse("알림 4.9초 전", probe(now = 4900))
        assertFalse("30초 안에 또", probe(now = 40_000, lastEvent = 30_000, lastProbe = 20_000))
        assertTrue(probe(now = 60_000, lastEvent = 50_000, lastProbe = 20_000))
        assertFalse("상세·다른 화면", probe(now = 5000, list = false))
        assertFalse("누름이 걸려 있다", probe(now = 5000, busy = true))
        assertFalse("SDK 33 미만", probe(now = 5000, sdk = 32))
    }

    @Test fun `새로 보인 줄 - 앞 세 개까지`() =
        assertEquals(listOf("강남 세곡", "강남 대치2", "8,190"),
            WalkProbe.newLines(listOf("퀵", "송파 가락2", "15,015"), listOf("퀵", "송파 가락2", "강남 세곡", "강남 대치2", "8,190", "퀵 승")))

    @Test fun `요약 줄 - 방식별 훑기와 알림 뒤 첫 읽기를 나눠 싣는다`() {
        val s = ScanTimer()
        s.record(300, false, 0, walkMs = 250, way = "기본", afterEvent = true)
        s.record(120, false, 300, walkMs = 90, way = "미리 받기", afterEvent = true)
        s.record(20, true, 600, walkMs = 10, way = "미리 받기", afterEvent = false)
        assertEquals("1000ms 동안 3번(같은 글자 1) · 평균 146ms · 최대 300ms · 합 440ms · 훑기 합 350ms" +
            " · 훑기 기본 250ms/1번 · 미리 받기 100ms/2번 · 알림 뒤 첫 훑기 기본 250ms/1번 · 미리 받기 90ms/1번",
            s.tick(1000, force = false))
    }
}
