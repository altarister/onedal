package com.onedal.app.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * ✋ **기사님 손이 먼저** (기사님 «시스템과 기사의 input 이 같이 들어가면 뭐가 우선?» · onedal-1f «가»).
 * 손이 움직인 뒤 [HandFirst.QUIET_MS] 동안 앱은 소리도 누르기도 미룬다. 멈추면 곧바로 다시 읽어 그 화면에서 고른다(담아 두지 않는다).
 * 3초 근거(폰 로그 09-30 · 어림): 상세→목록 복귀 뒤 다음 손 동작 54번 — 3초 안 17 · 5초 안 28 · 중앙 4.5초.
 */
class HandFirstTest {
    @Test fun `손 뒤 3초 안에는 막고 3초 뒤는 푼다`() {
        val h = HandFirst()
        assertFalse("손 흔적 없음", h.blocks(10_000))
        h.onHand(10_000)
        assertTrue(h.blocks(11_000))
        assertFalse(h.blocks(13_000))
        assertEquals(13_000L, h.quietAtMs())
    }

    @Test fun `앱이 쏜 터치 뒤 700ms 안의 누름 알림은 손이 아니다`() {
        assertFalse(HandFirst.isClickHand(clickAtMs = 5_400, lastAppTapAtMs = 5_000))
        assertTrue(HandFirst.isClickHand(clickAtMs = 6_000, lastAppTapAtMs = 5_000))
        assertTrue("앱이 쏜 적 없음", HandFirst.isClickHand(clickAtMs = 6_000, lastAppTapAtMs = 0))
    }

    @Test fun `미룬 ms 는 처음 미룬 때부터 · 한 번만`() {
        val h = HandFirst()
        h.hold(20_000); h.hold(21_000)
        assertEquals(3_500L, h.releasedMs(23_500))
        assertNull(h.releasedMs(24_000))
    }

    @Test fun `손 흔적 네 자리 · 로그 두 줄 · 기준 문장`() {
        val src = File("src/main/java/com/onedal/app/HijackService.kt").readText()
        assertTrue("스크롤 · 손 상세 · 앱이 안 한 복귀 · 누름 알림", Regex("""onHand\(""").findAll(src).count() >= 5)
        assertTrue(src.contains("✋ [손 먼저] 기사님 손"))
        assertTrue("소리는 곧바로 · 누르기만 미룬다(기사님 «가»)", src.contains("— 소리는 울림 · 누르기 미룸"))
        assertTrue(src.contains("👆 [미룬 누르기] +\${it}ms · 손 먼저"))
        // 누르기만 손에 막힌다 — 소리(fire)는 손 문 밖이고, 누름(planListTap)은 손 문 안이다
        val block = src.substringAfter("val handHeld =").substringBefore("\n    private fun ")
        assertTrue(block.contains("if (!handHeld) {"))
        assertTrue(block.indexOf("alarmSignaler.fire(") < block.indexOf("if (!handHeld) {"))
        assertTrue(src.contains("누를 콜은 늘 방금 읽은 화면에서 고른다 — 담아 두지 않는다"))
    }

    /** 🔁 뜻을 나눈다 — 앱 뒤로 가기 메아리(뒤로 → 목록 실측 0.7~0.9초)는 손 먼저 3초가 아니라 전용 2초 */
    @Test fun `뒤로 가기 메아리 2초는 손 먼저 3초와 따로다`() {
        assertEquals(2_000L, HandFirst.APP_BACK_ECHO_MS)
        val src = File("src/main/java/com/onedal/app/HijackService.kt").readText()
        assertTrue(src.contains("touchManager.lastAppBackAtMs > com.onedal.app.core.HandFirst.APP_BACK_ECHO_MS"))
    }

    /** 👆 잠금 창을 정하기 전에 센다 — 앱이 누른 뒤 1초 안에 손 흔적이 오면 ms (onedal-1f «나») */
    @Test fun `앱 누름 뒤 1초 안의 손을 ms 로 센다`() {
        assertEquals(400L, HandFirst.afterAppTapMs(nowMs = 5_400, lastAppTapAtMs = 5_000))
        assertNull(HandFirst.afterAppTapMs(nowMs = 6_200, lastAppTapAtMs = 5_000))
        assertNull("앱이 쏜 적 없음", HandFirst.afterAppTapMs(nowMs = 6_200, lastAppTapAtMs = 0))
        assertTrue(File("src/main/java/com/onedal/app/HijackService.kt").readText().contains("👆 [앱 누름 뒤 손]"))
    }
}
