package com.onedal.app.plugins.kakaopicker

import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * 📏 **카드 묶는 칸은 «이웃 요금 사이 간격의 절반» 이다 — 고정 픽셀이 아니다** (기사님 지시).
 *
 * 카드 글자는 요금 글자를 중심으로 모은다. 그 칸이 **60픽셀 고정**이었는데,
 * **예약 카드는 줄이 하나 더 있어 맨 윗줄이 80픽셀 떨어진다** — 그 줄이 통째로 잘렸다.
 * 잘린 줄에 도착지가 들어 있어 «기흥 → (빈칸)» 꼴로 장부에 올랐다 (예약 콜 114건 중 20건).
 *
 * ── 실물 좌표 (`log/카카오픽커/화면덤프_0830/04_리스트_예약카드.xml`) ──
 * ```
 *   y=1881  «강남»                    ← 16,478 카드의 맨 윗줄 (요금에서 80px)
 *   y=1904  «퀵 승 예약 내일 착불»       ← 태그줄 (57px)
 *   y=1961  «16,478»                 ← 요금
 * ```
 * 카드 간격은 163~185px 이라 **절반은 81~92px** — 80px 은 담기고, 이웃에 더 가까운 글자는 그쪽으로 간다.
 *
 * 🔴 **고정 픽셀을 쓰지 않는 까닭**: 카드 높이는 배지 줄 수에 따라 달라진다. 실물에서 잰 값 하나를
 *    박아 두면 줄이 하나 더 붙는 날 또 잘린다. 간격의 절반은 화면이 바뀌어도 스스로 맞는다.
 * 🔴 **한 글자는 한 카드에만 붙는다** — 두 카드에 겹쳐 들어가던 사고(0830 «처인 대치2»)를 막는 규칙은 그대로다.
 */
class PickerCardBandTest {

    /** 실물 예약 카드 — 요금 셋이 163·185 간격으로 선다 */
    private val anchors = listOf(1613, 1776, 1961)

    @Test
    fun `예약 카드의 맨 윗줄은 제 카드에 담긴다 - 80px 도 안 잘린다`() {
        // «강남» y=1881 — 1961 요금에서 80px 위. 이웃(1776)까지는 105px 이라 1961 쪽이 가깝다
        assertEquals(2, KakaoPickerParser.nearestAnchorIndex(anchors, 1881))
    }

    @Test
    fun `태그줄도 제 카드에 담긴다`() {
        assertEquals(2, KakaoPickerParser.nearestAnchorIndex(anchors, 1904))   // 57px
        assertEquals(1, KakaoPickerParser.nearestAnchorIndex(anchors, 1742))   // 34px — 3,200 카드
        assertEquals(1, KakaoPickerParser.nearestAnchorIndex(anchors, 1806))   // 30px — 3,200 카드 지역줄
    }

    /** 🔴 0830 실사고 — 두 요금이 애니메이션으로 가까워졌을 때 사이 글자가 두 카드에 다 들어갔다 */
    @Test
    fun `사이에 낀 글자는 가까운 카드 하나에만 붙는다`() {
        val tight = listOf(1124, 1224)
        assertEquals(1, KakaoPickerParser.nearestAnchorIndex(tight, 1180))
        assertEquals(0, KakaoPickerParser.nearestAnchorIndex(tight, 1124))
    }

    /** 🔴 멀리 떨어진 글자는 어디에도 안 붙는다 — 칸이 «간격의 절반» 이라 저절로 걸린다 */
    @Test
    fun `카드 밖 글자는 안 붙는다`() {
        val tight = listOf(1124, 1224)        // 간격 100 → 절반 50
        assertEquals(-1, KakaoPickerParser.nearestAnchorIndex(tight, 1350))   // 126px 떨어짐
    }

    /** 🔴 요금이 하나뿐이면 이웃이 없다 — 그때는 카드 한 장 높이만큼만 본다 */
    @Test
    fun `요금이 하나면 카드 한 장 높이로 본다`() {
        val one = listOf(1000)
        assertEquals(0, KakaoPickerParser.nearestAnchorIndex(one, 1080))      // 80px — 담긴다
        assertEquals(-1, KakaoPickerParser.nearestAnchorIndex(one, 1400))     // 400px — 안 담긴다
    }
}
