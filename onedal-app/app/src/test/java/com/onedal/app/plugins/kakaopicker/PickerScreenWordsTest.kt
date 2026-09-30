package com.onedal.app.plugins.kakaopicker

import com.onedal.app.core.Page
import com.onedal.app.core.ScreenWords
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * 📰 **픽커 목록 줄에서 뺀 글자가 모인다** — 맨 아래 카드 띠에 걸친 메뉴 «카드설정»(잡음) · 경로 조립에서 남은 지역 토막(남는 토막).
 * 배차망이 목록을 바꾸면 이 표에 먼저 드러난다 (reviews/24).
 */
class PickerScreenWordsTest {
    @After fun clear() { ScreenWords.onScreen(null); ScreenWords.drain() }

    @Test fun `잡음과 남는 토막이 모이고 쓴 칸은 안 모인다`() {
        ScreenWords.onScreen(Page.LIST)
        val o = KakaoPickerParser(null).parse(listOf("퀵", "소형", "강남", "6.8km", "광주", "송정", "역삼1", "역삼2", "19,404", "카드설정"))
        assertEquals("광주 송정", o.pickup)
        val words = ScreenWords.drain()!!.words.map { it.kind to it.word }
        assertEquals(listOf("noise" to "카드설정", "extra" to "<지역>"), words)
    }
}
