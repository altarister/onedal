package com.onedal.app.plugins.kakaopicker

import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * 🔎 **상세 대기 로그에 «누가 열었나»를 적는다** (기사님 지시)
 *
 * 기사님: *"손으로 연 상세가 60초 뒤 돌아오는지 — 로그캣에 넣어서 나중에 확인할 수 있게 만들어"*
 *
 * 이 기록이 없으면 알람이 연 상세와 손으로 연 상세가 로그에서 섞여 «손으로 연 상세도 돌아온다»를 가를 수 없다.
 * 타이머는 누가 열었든 한 곳에서 걸리므로(#124) 동작은 같다 — **기록만** 갈라 적는다.
 * 알람이 카드를 누른 뒤 상세가 뜨기까지는 실측 0.3~0.4초 — 5초 안이면 알람이 연 것이다.
 */
class DetailOpenerTest {

    @Test
    fun `알람이 방금 카드를 눌렀다 - 알람`() {
        assertEquals("알람", KakaoPickerKeywords.detailOpener(alarmTapAtMs = 10_000L, nowMs = 10_400L))
    }

    @Test
    fun `알람이 누른 적이 없다 - 손`() {
        assertEquals("손", KakaoPickerKeywords.detailOpener(alarmTapAtMs = 0L, nowMs = 10_400L))
    }

    @Test
    fun `알람이 누른 지 오래됐다 - 그 뒤에 기사님이 손으로 연 상세다`() {
        assertEquals("손", KakaoPickerKeywords.detailOpener(alarmTapAtMs = 10_000L, nowMs = 10_000L + 60_000L))
    }

    @Test
    fun `경계 - 5초까지는 알람 · 넘으면 손`() {
        assertEquals("알람", KakaoPickerKeywords.detailOpener(alarmTapAtMs = 10_000L, nowMs = 15_000L))
        assertEquals("손", KakaoPickerKeywords.detailOpener(alarmTapAtMs = 10_000L, nowMs = 15_001L))
    }
}
