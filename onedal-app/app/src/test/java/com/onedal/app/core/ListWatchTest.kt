package com.onedal.app.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import com.onedal.app.models.ScreenContext

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

    /**
     * ✋ **손이 닿은 직후 10초는 1.5초 간격** (onedal-1f «가» · 실측 조용한 다시 읽기 30분 4.2%).
     * 16:18:24 스크롤 4초 뒤 · 19:46 겹친 틀 뒤 손 상세 — 기사님은 카드를 보고 1~4초 안에 누르신다. 5초 주기로는 그 전에 목록을 못 읽었다.
     * 방아쇠는 개별 사실 — 스크롤 알림 · 상세→목록 복귀 · 겹친 틀 버림.
     */
    @Test fun `손 닿은 뒤 4초 안에 다시 읽는다 - 1초 주기 감시`() {
        val touched = 0L
        val firstRead = (1_000L..4_000L step 1_000).first { now ->
            ListWatch.shouldRead(now, lastReadMs = 0, lastEventMs = 0, watched = true, busy = false, touchedAtMs = touched)
        }
        assertTrue("손 닿은 뒤 첫 다시 읽기가 ${firstRead}ms", firstRead <= 4_000)
    }

    @Test fun `알림 읽기가 방금 돌았으면 건너뛴다 - 두 번 읽지 않게`() =
        assertFalse(ListWatch.shouldRead(nowMs = 3_000, lastReadMs = 2_500, lastEventMs = 0, watched = true, busy = false, touchedAtMs = 0))

    @Test fun `손 닿은 뒤 10초가 지나면 5초로 돌아간다`() {
        assertFalse(ListWatch.shouldRead(nowMs = 12_000, lastReadMs = 10_000, lastEventMs = 0, watched = true, busy = false, touchedAtMs = 0))
        assertTrue(ListWatch.shouldRead(nowMs = 15_000, lastReadMs = 10_000, lastEventMs = 0, watched = true, busy = false, touchedAtMs = 0))
    }

    /**
     * 🧭 **목록 밖 배차망 화면도 지켜본다** — 픽커 설정 시트를 «←»로 닫고 목록에 돌아와도 픽커가 알림을 더 안 내
     * 원달앱이 다음 정각(목록 새로 고침)까지 47초 동안 «설정»으로 알았다(실물 A24 09:46:13 → 09:47:00).
     * 상세 · 팝업 · 운행 · 넘어가는 중은 알림으로만 읽는다 · 바탕화면 · 다른 앱 · 배차망 앱 밖(시뮬레이터 자기 화면)은 안 본다.
     */
    @Test fun `목록 밖 배차망 화면 - 메뉴 · 홈 · 내 오더 · 모름은 지켜본다`() {
        listOf(ScreenContext.NETWORK_MENU, ScreenContext.HOME, ScreenContext.MY_ORDERS, ScreenContext.UNKNOWN)
            .forEach { assertTrue("$it", ListWatch.watches(it, onNetworkPage = true)) }
        assertTrue(ListWatch.watches(ScreenContext.LIST, onNetworkPage = false))
    }

    @Test fun `상세 · 팝업 · 운행 · 넘어가는 중 · 바탕화면 · 다른 앱은 안 지켜본다`() {
        listOf(ScreenContext.DETAIL_PRE_CONFIRM, ScreenContext.DETAIL_CONFIRMED, ScreenContext.POPUP_PICKUP, ScreenContext.POPUP_ERROR,
            ScreenContext.RUN_TO_PICKUP, ScreenContext.TRANSITION, ScreenContext.LAUNCHER, ScreenContext.OTHER_APP)
            .forEach { assertFalse("$it", ListWatch.watches(it, onNetworkPage = true)) }
    }

    @Test fun `배차망 앱 밖의 모름(시뮬레이터 자기 화면)은 안 지켜본다`() =
        assertFalse(ListWatch.watches(ScreenContext.UNKNOWN, onNetworkPage = false))

    @Test fun `목록을 떠난 직후(손 닿음) 메뉴에서 2초 안에 다시 읽는다`() =
        assertTrue(ListWatch.shouldRead(nowMs = 1_500, lastReadMs = 0, lastEventMs = 0,
            watched = ListWatch.watches(ScreenContext.NETWORK_MENU, onNetworkPage = true), busy = false, touchedAtMs = 0))

    @Test fun `손 닿은 뒤라도 지켜보는 화면이 아니면 안 돈다`() =
        assertFalse(ListWatch.shouldRead(nowMs = 2_000, lastReadMs = 0, lastEventMs = 0, watched = false, busy = false, touchedAtMs = 0))
}
