package com.onedal.app.plugins.kakaopicker

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * 🚧 **아래 탭 막대는 «경계»가 아니라 목록 위에 겹쳐 떠 있는 막대다.**
 *
 * 처음엔 탭 줄 아래를 통째로 버렸다 — «신규»·«내 오더» 가 카드의 지역 이름으로 새어 들어가서다
 * (09-16 실측에서 픽업지가 «신규 내 오더»로 서버에 올라갔다).
 * 그런데 **목록은 그 막대 뒤로 이어진다.** 그래서 마지막 카드의 아랫줄(출발동·도착동·거리)이
 * 통째로 잘렸고, 카드 키가 큰 도보 콜은 **요금까지 막대 아래로 내려가 콜 한 건이 통째로** 사라졌다.
 *
 * 🔴 **그래서 «자리»가 아니라 «이름»으로 버린다.** 이름 목록은 서버 사전(`bottomTabWords`)이라
 *    픽커가 탭을 바꿔도 앱 재설치 없이 한 줄로 따라간다.
 * 🔴 **자리만으로는 못 막는다** — 「카드설정」은 마지막 요금에서 6px 밖에 안 떨어져 있어
 *    묶는 칸(이웃 간격의 절반) 안에 넉넉히 든다.
 *
 * 이 검사는 **퀵 목록**을 본다 (`log/카카오픽커/화면덤프_0830/04_리스트_예약카드.xml`).
 * 도보 목록은 `PickerListWholeScreenTest` 가 따로 본다 — 두 화면은 카드 구조가 다르다.
 */
class PickerBottomTabTest {

    /** 실물 퀵 목록 한 장 — (글자, 중심Y, 중심X). 맨 아래가 예약 카드라 배지 줄이 하나 더 있다 */
    private val quickScreen = listOf(
        Triple("퀵 배송", 298, 121),
        Triple("도보배송", 298, 378),
        Triple("한차배송", 298, 647),
        Triple("대리", 298, 882),
        Triple("퀵 서포트 모드 1장 받기", 437, 452),
        Triple("0/1건", 437, 700),
        Triple("퀵 오더카드 대기 중...", 591, 540),
        Triple("리스트 설정", 795, 149),
        Triple("추천순", 795, 363),
        Triple("20km", 795, 581),
        Triple("퀵", 926, 50),
        Triple("반나절", 926, 128),
        Triple("승", 926, 206),
        Triple("강동", 927, 524),
        Triple("14,466", 961, 965),
        Triple("19.6km", 991, 105),
        Triple("하남", 991, 232),
        Triple("신장2", 991, 329),
        Triple("천호3", 991, 542),
        Triple("퀵", 1090, 50),
        Triple("단거리", 1090, 128),
        Triple("준비 14분", 1090, 262),
        Triple("소형", 1090, 380),
        Triple("중원", 1090, 524),
        Triple("2,529", 1124, 981),
        Triple("14.2km", 1154, 105),
        Triple("중원", 1154, 232),
        Triple("금광2", 1154, 329),
        Triple("금광2", 1154, 542),
        Triple("퀵", 1253, 50),
        Triple("단거리", 1253, 128),
        Triple("준비 18분", 1253, 262),
        Triple("소형", 1253, 380),
        Triple("수정", 1253, 524),
        Triple("5,400", 1287, 981),
        Triple("15.0km", 1317, 105),
        Triple("수정", 1317, 232),
        Triple("신흥3", 1317, 329),
        Triple("태평1", 1317, 542),
        Triple("퀵", 1416, 50),
        Triple("단거리", 1416, 128),
        Triple("준비 7분", 1416, 251),
        Triple("소형", 1416, 358),
        Triple("처인", 1416, 524),
        Triple("8,700", 1450, 981),
        Triple("15.5km", 1480, 105),
        Triple("처인", 1480, 232),
        Triple("유림2", 1480, 329),
        Triple("유림1", 1480, 542),
        Triple("퀵", 1579, 50),
        Triple("단거리", 1579, 128),
        Triple("준비 24분", 1579, 262),
        Triple("소형", 1579, 380),
        Triple("수지", 1579, 524),
        Triple("2,387", 1613, 981),
        Triple("15.6km", 1643, 105),
        Triple("수지", 1643, 232),
        Triple("죽전1", 1643, 329),
        Triple("죽전1", 1643, 542),
        Triple("퀵", 1742, 50),
        Triple("단거리", 1742, 128),
        Triple("준비 11분", 1742, 262),
        Triple("소형", 1742, 380),
        Triple("이천", 1742, 524),
        Triple("3,200", 1776, 981),
        Triple("17.0km", 1806, 105),
        Triple("이천", 1806, 232),
        Triple("창전", 1806, 316),
        Triple("중리", 1806, 529),
        Triple("강남", 1881, 524),
        Triple("퀵", 1904, 50),
        Triple("승", 1904, 100),
        Triple("예약", 1904, 164),
        Triple("내일", 1904, 234),
        Triple("착불", 1906, 1016),
        Triple("서포트모드", 1955, 351),
        Triple("카드설정", 1955, 557),
        Triple("수요지도", 1955, 746),
        Triple("16,478", 1961, 965),
        Triple("15.1km", 1969, 105),
        Triple("분당", 1969, 211),
        Triple("신규", 2134, 266),
        Triple("내 오더", 2134, 806),
    )

    private fun cards() = KakaoPickerParser.groupByFare(quickScreen)

    @Test
    fun `화면에 선 요금이 일곱이면 카드도 일곱이다`() {
        assertEquals(7, cards().size)
    }

    /** 🔴 탭 막대를 사이에 두고 갈라진 카드도 한 장으로 담긴다 — 위로 배지, 아래로 출발지 */
    @Test
    fun `탭 막대에 걸친 카드도 위아래를 다 담는다`() {
        val last = cards().last().second
        assertTrue("요금", "16,478" in last)
        assertTrue("막대 위 - 도착 시군구", "강남" in last)
        assertTrue("막대 위 - 배지", "예약" in last)
        assertTrue("막대 위 - 착불", "착불" in last)
        assertTrue("막대 아래 - 출발 시군구", "분당" in last)
        assertTrue("막대 아래 - 거리", "15.1km" in last)
    }

    /** 🔴 탭 글자는 이름으로 버린다 — 자리로는 6px 이라 절대 못 막는다 */
    @Test
    fun `탭 글자는 어느 카드에도 안 들어간다`() {
        val everything = cards().flatMap { it.second }
        for (w in listOf("서포트모드", "카드설정", "수요지도", "신규", "내 오더")) {
            assertFalse("탭 글자 «$w» 가 카드에 샜다", w in everything)
        }
    }

    /** 🔴 탭 이름이 바뀌어 하나도 못 찾아도 **카드는 그대로 나온다** — 모르면 손대지 않는다 (규칙 ④) */
    @Test
    fun `탭 낱말을 하나도 모르면 카드를 버리지 않는다`() {
        val cards = KakaoPickerParser.groupByFare(quickScreen, tabWords = emptySet())
        assertEquals(7, cards.size)
        assertTrue("16,478" in cards.last().second)
    }

    @Test
    fun `목록 머리글과 대기 안내는 첫 카드에 안 들어간다`() {
        val first = cards().first().second
        assertFalse("리스트 설정" in first)
        assertFalse("추천순" in first)
        assertFalse("퀵 오더카드 대기 중..." in first)
    }
}
