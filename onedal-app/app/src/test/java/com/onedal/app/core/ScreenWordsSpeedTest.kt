package com.onedal.app.core

import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

/**
 * ⏱️ **남는 글자 모으기는 예시 글 하나를 한 번만 가린다** (기사님 «느려» · onedal-1f «가»).
 * 새 낱말마다 화면 전체(수백 토막)를 다시 가려, 인성 화면이 바뀔 때마다 메인 스레드가 0.6~1초 멈췄다(cb791e3b 읽기 나눔).
 * 서버가 받는 낱말·예시 모양은 고치기 전과 같아야 한다.
 */
class ScreenWordsSpeedTest {
    @Before fun clearBefore() { ScreenWords.onScreen(null); while (ScreenWords.drain() != null) Unit }
    @After fun clear() { ScreenWords.onScreen(null); while (ScreenWords.drain() != null) Unit }

    /** 인성 상세 모양 — 가게·주소·전화·시각·물품 토막이 섞인 200줄 */
    private val detail = (1..200).map { i ->
        when (i % 5) {
            0 -> "물품메모$i 조심"
            1 -> "[중리$i 점]하나로유통"
            2 -> "고객요청$i : 문앞"
            3 -> "04:${(i % 60).toString().padStart(2, '0')} 도착희망$i"
            else -> "적요칸$i"
        }
    }
    private val sample = detail.joinToString(" ")

    @Test fun `속도 - 화면 한 번에 예시 글은 한 번만 가린다`() {
        ScreenWords.onScreen(Page.DETAIL, detail, sample)
        ScreenWords.maskTokens = 0
        val report = ScreenWords.drain()
        assertTrue("낱말이 모여야 한다", (report?.words?.size ?: 0) > 50)
        val sampleTokens = sample.split(" ").size
        assertTrue("가린 토막 ${ScreenWords.maskTokens} — 예시 글($sampleTokens 토막) 한 번 + 낱말 자체", ScreenWords.maskTokens <= 2L * sampleTokens)
    }

    @Test fun `뜻 - 낱말과 예시 모양이 고치기 전과 같다`() {
        ScreenWords.onScreen(Page.DETAIL, detail, sample)
        val report = ScreenWords.drain()!!
        val expectSample = ScreenWords.mask(sample).take(200)
        assertTrue("예시는 화면 글을 가려 자른 것", report.words.all { it.sample == expectSample })
        val words = report.words.map { "${it.kind}|${it.word}" }
        assertEquals(GOLDEN_SIZE, words.size)
        assertEquals(GOLDEN_HASH, words.hashCode())
        assertEquals(GOLDEN_SAMPLE_HASH, expectSample.hashCode())
    }

    /** 고치기 전 코드(가림 183번)가 낸 값 */
    private companion object {
        const val GOLDEN_SIZE = 103
        const val GOLDEN_HASH = -167351997
        const val GOLDEN_SAMPLE_HASH = 1970578107
    }
}
