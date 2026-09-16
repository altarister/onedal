package com.onedal.app.plugins.kakaopicker

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * ⏸️ **퀵 콜인데 하차지를 못 읽었으면 이번엔 울리지 않는다** (기사님 지시).
 *
 * 목록을 넘기는 중에는 픽커가 글자를 **반만** 올린다. 실측에서 원문이
 * «퀵 승 예약 16:10 14.4km 분당 서초 방배본 15,540» 처럼 지역 한 토막이 빠져 왔고,
 * 앱은 하차지를 빈칸으로 둔 채 «도착 ✅»로 통과시켜 **상세까지 들어가려 했다.**
 * 상세에 들어가면 30초 동안 목록을 못 본다 — 그동안 뜬 콜은 평가되지 않는다.
 *
 * 🔴 **거르는 것이 아니라 미루는 것이다.** 다음 화면 읽기에서 제대로 읽히면 그때 운다.
 *    모르는 값을 불리하게 보지 않는다는 규칙(⑤-2)은 그대로다 — 여기서 막는 것은
 *    «아직 덜 읽힌 화면»이지 «조건이 나쁜 콜»이 아니다.
 *
 * 🔴 **도보 콜은 원래 하차지가 빈다** — 리스트에 가게 이름과 시간만 나오고 지역 토막이 넷이 안 된다.
 *    도보까지 막으면 도보 알람이 통째로 죽는다.
 */
class PickerAlarmDropoffTest {

    @Test
    fun `퀵인데 하차지를 못 읽었으면 미룬다`() {
        assertTrue(KakaoPickerParser.quickDropoffUnread("퀵 승 예약 16:10", ""))
        assertTrue(KakaoPickerParser.quickDropoffUnread("퀵 중형", "   "))
    }

    @Test
    fun `하차지를 읽었으면 운다`() {
        assertFalse(KakaoPickerParser.quickDropoffUnread("퀵 승", "서초 방배본"))
    }

    @Test
    fun `🔴 도보는 원래 하차지가 비니 그대로 운다`() {
        assertFalse(KakaoPickerParser.quickDropoffUnread("도보 준비 완료", ""))
        assertFalse(KakaoPickerParser.quickDropoffUnread("도보 준비 14분", ""))
    }

    @Test
    fun `🔴 무엇인지 모르면 막지 않는다 - 태그가 없는 판`() {
        assertFalse(KakaoPickerParser.quickDropoffUnread(null, ""))
        assertFalse(KakaoPickerParser.quickDropoffUnread("", ""))
    }
}
