package com.onedal.app.core

import com.onedal.app.plugins.kakaopicker.KakaoPickerParser
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * 🔔 알람 테두리의 세로 구간 채점 — **버그 대장 #83 을 잡았을 검사**.
 *
 * 2026-08-30 실폰: 테두리가 통과 콜 카드가 아니라 **카드와 카드 사이 빈 줄**에 그려졌다
 * (스크린샷 증거). 세 겹 중 JVM 에서 잡히는 것은 «높이» 다 —
 * 요금 글자 한 줄(66px)만 둘러서, 카드의 태그줄·지역줄이 테두리 밖에 있었다.
 *
 * 좌표는 전부 실물 덤프(`log/카카오픽커/화면덤프_0830/`)의 그 카드다 — 지어내지 않았다.
 * (나머지 두 겹 — 상태바 기준점·스크롤 추적 — 은 창 시스템이라 실폰으로 검증한다)
 */
class AlarmSignalerSpanTest {

    @Test
    fun `픽커 카드 - 테두리가 태그줄과 지역줄까지 덮는다 (요금 한 줄이 아니라)`() {
        // 실측: 태그줄 중심 y=927 · 요금 노드 927~995 (중심 961) · 지역줄 중심 y=991
        val (top, bottom) = AlarmSignaler.borderSpan(927, 995, KakaoPickerParser.CARD_BAND_PX)
        assertTrue("태그줄(927)이 테두리 밖: $top~$bottom", top <= 927 - 20)
        assertTrue("지역줄(991)이 테두리 밖: $top~$bottom", bottom >= 991 + 20)
    }

    @Test
    fun `띠 반높이 0 이면 닻 줄 그대로 - 인성처럼 요금 줄이 곧 카드인 판`() {
        assertEquals(Pair(900, 1000), AlarmSignaler.borderSpan(900, 1000, 0))
    }

    @Test
    fun `픽커 파서는 카드 띠 반높이를 알람에 알려준다 - 묶기와 같은 값`() {
        // 카드 묶기(inCardBand)와 테두리가 딴 값을 쓰면 «묶은 카드»와 «두른 카드»가 갈라진다
        assertEquals(KakaoPickerParser.CARD_BAND_PX, KakaoPickerParser(null).alarmBandHalfPx())
    }
}
