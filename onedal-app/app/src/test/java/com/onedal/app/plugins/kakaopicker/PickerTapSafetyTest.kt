package com.onedal.app.plugins.kakaopicker

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * 🔴 **자동 탭이 «계약»이 되어 버리는 자리를 막는다** (2026-09-13 · 라이브 오배차 조사).
 *
 * 09-13 새벽 기사님이 주무시는 사이 앱이 픽커 카드를 눌렀고 두 건이 배차됐다.
 * 조사에서 드러난 것은 **앱이 낱말을 안 보고 «요금 숫자 모양»만 본다**는 것이다 —
 * `isFareAnchor` = 쉼표 든 숫자 + 화면 오른쪽. 그리고 그 글자의 **정중앙**을 찍는다.
 *
 * 🔴 **오더카드(리스트 맨 위 제안 띠)는 요금 숫자가 「수락」 버튼 «안»에 있다.**
 *    그래서 그 요금을 찍으면 상세로 가는 게 아니라 **그 자리에서 계약이 성립한다.**
 *    (실물 `ex_images/카카오픽커/실물_2026/04_오더카드_리스트상단띠_픽업배송km.jpeg`)
 *
 * 종전 방어는 `clickSafe` 하나였는데 그것은 **요금 중심 ±60픽셀**(`CARD_BAND_PX`) 안의
 * 글자에 「수락」이 있는지만 본다. 실물에서 「수락」은 요금 **약 70픽셀 아래**라
 * **띠 밖이고, 그대로 통과한다.** 문자열 한 개에 계약을 걸어 둔 셈이었다.
 *
 * 🟢 **그래서 구조로 가른다** — 화면에는 「리스트 설정」 머리줄이 있고,
 *    **오더카드는 그 위, 리스트 카드는 그 아래**다. 실물 덤프 8장에서 요금 닻은
 *    **전부** 머리줄보다 166픽셀 아래였다 (`log/카카오픽커/화면덤프` 8장).
 *    낱말이 띠에 걸리느냐 마느냐에 기대지 않는다.
 */
class PickerTapSafetyTest {

    // ── 실물 덤프에서 그대로 옮긴 좌표 (화면 1080x2340 · SM-A245N) ──
    // 화면덤프/04·05·06·09, 화면덤프_0830/02·04 → 머리줄 Y=795 · 최상단 요금 Y=961~983
    // 화면덤프/07·08                              → 머리줄 Y=708 · 최상단 요금 Y=874
    // 실물 사진 04_오더카드                        → 머리줄 Y≈862 · 오더카드 요금 Y≈590

    @Test
    fun `리스트 카드 - 머리줄 아래 요금은 눌러도 된다 (상세로 갈 뿐이다)`() {
        assertTrue(KakaoPickerParser.isListCardAnchor(961, 795))
        assertTrue(KakaoPickerParser.isListCardAnchor(983, 795))
        assertTrue(KakaoPickerParser.isListCardAnchor(874, 708))
        assertTrue("리스트 맨 아래 카드도 리스트다", KakaoPickerParser.isListCardAnchor(2003, 708))
    }

    @Test
    fun `오더카드 - 머리줄 위 요금은 수락 버튼이다, 누르지 않는다`() {
        assertFalse(KakaoPickerParser.isListCardAnchor(590, 862))
    }

    @Test
    fun `머리줄을 못 찾으면 누르지 않는다 - 모르면 고장으로 친다 (규칙 4)`() {
        assertFalse(
            "「리스트 설정」이 안 읽힌 판은 리스트인지 아닌지 모르는 판이다",
            KakaoPickerParser.isListCardAnchor(961, null),
        )
    }

    @Test
    fun `머리줄과 같은 높이는 리스트가 아니다 - 경계는 닫아 둔다`() {
        assertFalse(KakaoPickerParser.isListCardAnchor(795, 795))
    }

    @Test
    fun `머리줄 찾기 - 「리스트 설정」의 중심 Y 를 준다`() {
        val nodes = listOf(
            "알림" to 140,
            "퀵 배송" to 297,
            "리스트 설정" to 795,
            "추천순" to 795,
            "14,168" to 961,
        )
        assertEquals(795, KakaoPickerParser.listHeaderCenterY(nodes))
    }

    @Test
    fun `머리줄 찾기 - 없으면 null 이다 (0 이 아니다 · 규칙 4)`() {
        val nodes = listOf("알림" to 140, "14,168" to 961)
        assertNull(KakaoPickerParser.listHeaderCenterY(nodes))
    }
}
