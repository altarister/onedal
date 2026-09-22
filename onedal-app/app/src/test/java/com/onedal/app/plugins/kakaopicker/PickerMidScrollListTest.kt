package com.onedal.app.plugins.kakaopicker

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * 📋 **위도 아래도 안 보이는 «가운데 토막» 도 리스트다** (기사님 라이브: *"지금도 리스트 페이지야"*).
 *
 * 머리줄(«리스트 설정»)이 가려진 리스트는 **아래 탭 두 글자**(«신규 내 오더» + «서포트모드»)로 알아본다
 * (`isScrolledList`). 그런데 목록 한가운데를 보고 있으면 **위도 아래도 안 보인다** — 카드만 가득하다.
 * 아래 탭 두 글자로만 알아보면 그때 관제웹에 «픽커 알 수 없는 화면»이 뜬다.
 *
 * ── 실물 글자 (실물 카카오T픽커 라이브 · 358자 중 앞부분) ──
 *   퀵 승 예약 9/23(수) 12.0km 광주 능평 송파 삼전 16,940 퀵 중형 예약 9/23(수) 14.6km 분당 서현1 …
 *
 * 🔴 **낱말이 아니라 «카드 모양»으로 알아본다** — 「거리 + 요금」이 세 벌 넘게 되풀이되면 리스트다.
 *    픽커가 탭 이름을 바꿔도 안 뚫린다. 상세는 카드가 한 장뿐이라 안 걸린다.
 */
class PickerMidScrollListTest {

    /** 기사님이 보시던 그 화면 — 머리줄도 아래 탭도 없다 */
    private val midScroll =
        "퀵 승 예약 9/23(수) 12.0km 광주 능평 송파 삼전 16,940 " +
            "퀵 중형 예약 9/23(수) 14.6km 분당 서현1 분당 정자1 7,315 " +
            "퀵 승 예약 9/23(수) 16.4km 분당 백현 분당 정자1 8,778 " +
            "퀵 반나절 중형 예약 9/23(수) 16.8km 수정 위례 구로 구로1 14,861"

    @Test
    fun `카드가 여럿이면 머리줄이 없어도 리스트다`() {
        assertTrue("가운데 토막을 리스트로 못 알아본다", KakaoPickerKeywords.looksLikeCardList(midScroll))
    }

    @Test
    fun `🔴 상세는 카드가 한 장이라 리스트가 아니다`() {
        val detail = "픽업지 경기 성남시 분당구 정자3동 물품 정보 초소형 세 변의 합 70cm 최종 수익 11,910 넘기기 수락하기"
        assertFalse("상세를 리스트로 본다", KakaoPickerKeywords.looksLikeCardList(detail))
    }

    @Test
    fun `🔴 글자가 없으면 아무것도 아니다 - 지어내지 않는다`() {
        assertFalse(KakaoPickerKeywords.looksLikeCardList(null))
        assertFalse(KakaoPickerKeywords.looksLikeCardList(""))
    }

    @Test
    fun `가운데 토막이 화면 판별에서도 리스트로 나온다`() {
        assertEquals(
            com.onedal.app.models.ScreenContext.LIST,
            KakaoPickerKeywords.pickerScreenContextOf(midScroll),
        )
    }
}
