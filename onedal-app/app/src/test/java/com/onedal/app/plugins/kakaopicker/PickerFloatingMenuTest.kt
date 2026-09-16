package com.onedal.app.plugins.kakaopicker

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * 🎈 **떠 있는 메뉴가 카드 한가운데 끼어든다** (실물 카카오T픽커 라이브).
 *
 * 화면 위에 겹쳐 뜨는 «퀵 서포트 모드 1장 받기» · «0/1건» 이 **한 덩어리**로 와서
 * 카드 글자 사이에 섞인다. 그러면 지역 이름 자리를 차지해 출발·도착이 통째로 틀어진다.
 *
 * ── 실물 원문 (서버 장부 `intel.rawText` · 3건 모두 주소가 망가졌다) ──
 *   퀵 승 예약 9/18(금) **퀵 서포트 모드 1장 받기** 강남 0/1건 9,317 송파 장지 일원본 18.8km
 *   → 저장된 값 «강남 송파 → 퀵 서포트 모드 1장 받기 일원본»
 *
 * 🔴 **낱말을 더하는 것으로는 못 막는다** — 오늘 «준비 완료» · «31분 내» · «경유» · 광고 문구까지
 *    네 번 같은 계열에 당했다. 화면이 낱말을 **붙여서** 주면 목록에 없는 새 글자가 된다.
 *    그래서 **낱말이 든 덩어리를 통째로 버린다** — 사전 낱말을 품고 있으면 그 조각은 콜 정보가 아니다.
 */
class PickerFloatingMenuTest {

    private val parser = KakaoPickerParser(null)

    @Test
    fun `떠 있는 메뉴가 붙어 와도 주소를 망치지 않는다`() {
        val o = parser.parse(
            listOf(
                "퀵", "승", "예약", "9/18(금)", "퀵 서포트 모드 1장 받기", "강남", "0/1건",
                "9,317", "송파", "장지", "일원본", "18.8km",
            ),
        )
        assertEquals(9317, o.fare)
        assertTrue("메뉴 글자가 주소에 샜다: ${o.pickup}→${o.dropoff}",
            !"${o.pickup} ${o.dropoff}".contains("서포트"))
        assertTrue("메뉴 글자가 주소에 샜다: ${o.pickup}→${o.dropoff}",
            !"${o.pickup} ${o.dropoff}".contains("1장"))
    }

    @Test
    fun `메뉴가 섞여도 지역 넷이면 출발·도착을 제대로 가른다`() {
        val o = parser.parse(
            listOf(
                "초소형", "기흥", "퀵", "반나절", "예약", "내일", "12.7km",
                "중원", "상대원1", "서농", "13,930", "퀵 서포트 모드 1장 받기", "0/1건",
            ),
        )
        assertEquals("중원 상대원1", o.pickup)
        assertEquals("기흥 서농", o.dropoff)
    }

    @Test
    fun `🔴 사전 낱말을 품은 덩어리만 버린다 - 멀쩡한 지역은 그대로`() {
        val o = parser.parse(
            listOf("준비 완료", "소형", "기흥", "퀵", "단거리", "2,375", "기흥", "동백2", "동백1", "16.7km"),
        )
        assertEquals("기흥 동백2", o.pickup)
        assertEquals("기흥 동백1", o.dropoff)
    }
}
