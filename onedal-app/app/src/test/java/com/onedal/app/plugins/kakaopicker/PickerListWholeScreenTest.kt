package com.onedal.app.plugins.kakaopicker

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * 🖼️ **화면 한 장을 통째로 카드로 나눠 담는다** — 조각이 아니라 결과를 잠근다.
 *
 * 🔴 **조각만 검사하면 합쳐진 결과가 틀린 것을 못 본다.** 묶는 칸 · 위 경계 · 아래 탭 · 광고가
 *    저마다 초록인데, 실제로는 **화면 맨 아래 카드가 통째로 사라지고** 있었다.
 *    아래 탭 줄은 **경계가 아니라 목록 위에 떠 있는 막대**인데 그 아래를 다 버렸기 때문이다.
 *
 * ── 실물 좌표 (`log/카카오픽커/화면덤프/07_리스트_도보만.xml`) ──
 * ```
 *   y=1852  4,200                      ← 일곱째 카드 요금
 *   y=1955  카드설정                     ← 떠 있는 탭 막대 (목록 위에 겹쳐 그려진다)
 *   y=1981  46분 내
 *   y=1984  도보 · 준비 32분
 *   y=2003  4,200                      ← 여덟째 카드 요금 — 탭보다 아래다
 *   y=2018  참토스트-광주태전점
 *   y=2020  5.7km · 힐스테이트 태전
 *   y=2134  신규 · 내 오더               ← 탭 막대 아랫줄
 * ```
 * 도보 카드는 키가 커서 **요금까지 탭 아래로 내려간다** — 그래서 콜 한 건이 장부에 아예 안 올랐다.
 *
 * 🔴 **탭 글자는 «자리»가 아니라 «이름»으로 버린다** — 목록은 탭 막대 뒤로 이어진다.
 *    이름 목록은 서버 사전(`bottomTabWords`)이라 픽커가 탭을 바꿔도 앱 재설치가 필요 없다.
 * 🔴 **이름으로 안 버리면 새어 든다** — 「카드설정」은 여덟째 요금에서 48px 이고 묶는 칸은 75px 이라,
 *    자리만으로는 못 막는다 (09-16 에 픽업지가 «신규 내 오더»로 서버에 올라간 사고).
 */
class PickerListWholeScreenTest {

    /** 실물 도보 목록 한 장 — (글자, 중심Y, 중심X) */
    private val walkScreen = listOf(
        Triple("2", 139, 907),
        Triple("퀵 배송", 298, 121),
        Triple("도보배송", 298, 378),
        Triple("한차배송", 298, 647),
        Triple("대리", 298, 882),
        Triple("도보 오더카드 대기 중...", 504, 540),
        Triple("리스트 설정", 708, 149),
        Triple("높은 가격순", 708, 402),
        Triple("20km", 708, 659),
        Triple("443m", 840, 540),
        Triple("34분 내", 840, 670),
        Triple("도보", 843, 64),
        Triple("준비 19분", 843, 184),
        Triple("5,850", 874, 981),
        Triple("16.4km", 901, 105),
        Triple("교촌치킨-동판교점", 901, 331),
        Triple("봇들마을8단지아파트", 904, 671),
        Triple("976m", 1003, 540),
        Triple("33분 내", 1003, 670),
        Triple("도보", 1006, 64),
        Triple("준비 18분", 1006, 184),
        Triple("5,200", 1037, 981),
        Triple("18.8km", 1064, 105),
        Triple("교촌치킨-수지2지구점", 1064, 331),
        Triple("수지진산마을푸르지오", 1067, 671),
        Triple("349m", 1166, 540),
        Triple("33분 내", 1166, 670),
        Triple("도보", 1169, 64),
        Triple("준비 16분", 1169, 184),
        Triple("5,000", 1200, 981),
        Triple("17.5km", 1227, 105),
        Triple("곽두리쪽갈비-본점", 1227, 331),
        Triple("강남마을 한라비발디", 1230, 671),
        Triple("943m", 1329, 540),
        Triple("33분 내", 1329, 670),
        Triple("도보", 1332, 64),
        Triple("준비 18분", 1332, 184),
        Triple("4,700", 1363, 981),
        Triple("4.9km", 1390, 92),
        Triple("BHC-광주역점", 1390, 299),
        Triple("광주역자연앤자이", 1393, 646),
        Triple("486m", 1492, 540),
        Triple("43분 내", 1492, 670),
        Triple("도보", 1495, 64),
        Triple("준비 29분", 1495, 184),
        Triple("4,550", 1526, 981),
        Triple("17.3km", 1553, 105),
        Triple("백억커피-위례점", 1553, 331),
        Triple("위례 센트로엘", 1556, 612),
        Triple("847m", 1655, 540),
        Triple("34분 내", 1655, 670),
        Triple("도보", 1658, 64),
        Triple("준비 11분", 1658, 184),
        Triple("4,450", 1689, 981),
        Triple("19.3km", 1716, 105),
        Triple("백억커피-개롱점", 1716, 331),
        Triple("동남로23나길 12", 1719, 650),
        Triple("468m", 1818, 540),
        Triple("40분 내", 1818, 670),
        Triple("도보", 1821, 64),
        Triple("준비 26분", 1821, 184),
        Triple("4,200", 1852, 981),
        Triple("6.0km", 1879, 92),
        Triple("선주네수산도시횟집", 1879, 318),
        Triple("태전 경남아너스빌 시그니처", 1882, 671),
        Triple("카드설정", 1955, 540),
        Triple("46분 내", 1981, 677),
        Triple("도보", 1984, 64),
        Triple("준비 32분", 1984, 184),
        Triple("4,200", 2003, 981),
        Triple("참토스트-광주태전점", 2018, 301),
        Triple("5.7km", 2020, 92),
        Triple("힐스테이트 태전", 2020, 709),
        Triple("신규", 2134, 266),
        Triple("내 오더", 2134, 806),
    )

    private fun cards() = KakaoPickerParser.groupByFare(walkScreen)

    @Test
    fun `화면에 선 요금이 여덟이면 카드도 여덟이다`() {
        assertEquals(8, cards().size)
    }

    /** 🔴 떠 있는 탭 막대 아래 카드도 온전히 담긴다 — 도보 콜이 통째로 사라지던 자리 */
    fun lastCard(): List<String> = cards().last().second

    @Test
    fun `탭 막대 아래 카드도 요금과 주소를 다 담는다`() {
        val last = lastCard()
        assertTrue("요금", "4,200" in last)
        assertTrue("가게", "참토스트-광주태전점" in last)
        assertTrue("도착 건물", "힐스테이트 태전" in last)
        assertTrue("거리", "5.7km" in last)
        assertTrue("배지", "도보" in last)
        assertTrue("준비 시각", "준비 32분" in last)
        assertTrue("남은 시간", "46분 내" in last)
    }

    /** 🔴 탭 글자는 어느 카드에도 안 들어간다 — 픽업지가 «신규 내 오더»로 올라간 사고 */
    @Test
    fun `탭 글자는 어느 카드에도 안 들어간다`() {
        val everything = cards().flatMap { it.second }
        for (w in listOf("카드설정", "신규", "내 오더", "서포트모드", "수요지도")) {
            assertFalse("탭 글자 «$w» 가 카드에 샜다", w in everything)
        }
    }

    /** 🔴 위쪽 머리글도 안 들어간다 — 첫 카드가 «리스트 설정 높은 가격순» 을 주소로 삼던 자리 */
    @Test
    fun `목록 머리글은 첫 카드에 안 들어간다`() {
        val first = cards().first().second
        assertFalse("리스트 설정" in first)
        assertFalse("높은 가격순" in first)
        assertFalse("도보 오더카드 대기 중..." in first)
    }

    @Test
    fun `카드마다 제 가게와 제 도착지를 담는다 - 이웃 것을 안 가져온다`() {
        val second = cards()[1].second
        assertTrue("교촌치킨-수지2지구점" in second)
        assertTrue("수지진산마을푸르지오" in second)
        assertFalse("첫 카드 가게를 가져왔다", "교촌치킨-동판교점" in second)
        assertFalse("셋째 카드 가게를 가져왔다", "곽두리쪽갈비-본점" in second)
    }
}
