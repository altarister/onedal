package com.onedal.app.plugins.kakaopicker

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.assertFalse
import org.junit.Test

/**
 * 📢 **«이런 일거리 어떤가요? Ad» 부터 아래는 광고다 — 콜이 아니다** (기사님 지시).
 *
 * 목록 맨 아래, 마지막 카드와 아래 탭 사이에 구인 광고가 붙는다. 그 안에 **콜처럼 생긴 글자**가
 * 섞여 있어(«정기배송·운전» · «경기 포천시» · «모집 중» · «월급 280만원») 그냥 두면 지역·배지로 샌다.
 *
 * ── 실물 글자 (실물 카카오T픽커 라이브 · 광고 셋을 견줬다) ──
 *   … 송파 가락2 중랑 면목제3 10,087
 *   이런 일거리 어떤가요? **Ad** 프로필 등록하고… 이마트 [시간당 최대 2.7만원] … 모집 중 …
 *   이런 일거리 어떤가요? **Ad** 프로필 등록하고… 세종유통 … 월급 280만원 … 일급 11만원 …
 *
 * 🔴 **제목 문구는 바뀐다 — 광고 표시 «Ad» 를 경계로 삼는다** (기사님 지시: *"다른 말이 나올 수 있어,
 *    그 부분의 공통점을 찾아서 무시할 수 있어야 한다"*). 실측: 목록 269줄 중 «Ad» 가 든 줄 3개,
 *    그 뒤에 요금이 또 나온 줄은 **0개** — «Ad» 뒤로는 콜이 없다.
 * 🔴 위쪽 경계(«리스트 설정»)·아래쪽 경계(탭 줄)와 **같은 방식**이다 — 그 낱말의 Y 보다 아래를 버린다.
 * 🔴 광고가 없으면 **아무것도 안 버린다** (규칙 ④ — 모르면 손대지 않는다).
 */
class PickerAdCutTest {

    /** 실물 화면의 세로 자리 — 카드들 아래에 광고, 그 아래에 탭 줄 */
    private val screen = listOf(
        "리스트 설정" to 795,
        "송파 가락2" to 1700,
        "10,087" to 1740,
        "이런 일거리 어떤가요?" to 1900,
        "Ad" to 1900,
        "정기배송·운전" to 1960,
        "경기 포천시" to 2010,
        "월급 280만원" to 2060,
        "서포트모드" to 2150,
        "신규" to 2255,
    )

    /** 🔴 제목이 바뀐 광고 — 문구로 막으면 뚫리고, «Ad» 로 막으면 안 뚫린다 */
    private val screenOtherTitle = listOf(
        "리스트 설정" to 795,
        "송파 가락2" to 1700,
        "10,087" to 1740,
        "오늘의 추천 일자리" to 1900,
        "Ad" to 1900,
        "물류·포장·상하차" to 1960,
        "무신사 안성물류센터 알바" to 2010,
        "일급 11만원" to 2060,
    )

    @Test
    fun `🔴 제목 문구가 바뀌어도 광고를 찾는다`() {
        assertEquals(1900, KakaoPickerParser.adTopY(screenOtherTitle))
    }

    @Test
    fun `광고가 시작하는 y 를 찾는다`() {
        assertEquals(1900, KakaoPickerParser.adTopY(screen))
    }

    @Test
    fun `🔴 광고가 없으면 null - 아무것도 안 버린다`() {
        assertNull(KakaoPickerParser.adTopY(listOf("리스트 설정" to 795, "10,087" to 1740)))
    }

    @Test
    fun `광고 자리부터 아래는 콜 글자가 아니다`() {
        val top = KakaoPickerParser.adTopY(screen)
        assertTrue("광고 첫 줄을 안 버린다", KakaoPickerParser.isBelowAd(1900, top))
        assertTrue("광고 본문을 안 버린다", KakaoPickerParser.isBelowAd(2010, top))
        assertFalse("카드를 버린다", KakaoPickerParser.isBelowAd(1740, top))
    }

    @Test
    fun `🔴 광고를 못 찾았으면 아무것도 안 버린다`() {
        assertFalse(KakaoPickerParser.isBelowAd(2010, null))
    }
}
