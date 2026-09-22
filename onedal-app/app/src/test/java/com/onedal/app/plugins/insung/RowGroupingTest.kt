package com.onedal.app.plugins.insung

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * 📏 **요금을 못 읽는 빈 카드를 좌표로 재현한다**
 *
 * 실주행 로그에 `💸 [요금 못 읽음]` 줄이 스캔당 30개쯤 나오고, 그 줄의 뒤가 비어 있다.
 * 요금 숫자가 이상한 게 아니라 **카드에 글자가 하나도 안 묶인 것**이다. 차종 노드(카드를 묶는 기준 글자)는
 * 스캔마다 30개씩 찾는데 같은 줄 글자는 1~2개 카드에만 붙는다.
 *
 * 🔴 **이 검사는 고침이 아니라 재현이다.** 겹침 판정이 «열린 구간»이라, 높이가 0인
 *    사각형은 **자기 자신과도 안 겹친다** — 그러면 그 카드는 통째로 빈다.
 *    스크롤 밖 노드의 bounds 가 `(0,0,0,0)` 으로 온다면 정확히 이 모양이 된다.
 *
 * ⚠️ **아직 가설이다.** 좌표가 찍힌 실주행 로그로 «빈 카드의 rect 가 실제로 0인가»를 확인해야 확정된다
 *    (앱이 `👁️ [리스트 스캔]` 요약에 높이 0인 기준 글자 수를 센다).
 *    **원인을 확인한 뒤에 겹침 조건을 바꾼다** — 확인 전에 바꾸면 까닭 모를 조건이 코드에 남는다.
 */
class RowGroupingTest {

    private fun sameRow(a: Pair<Int, Int>, b: Pair<Int, Int>) =
        InsungParser.sameRow(a.first, a.second, b.first, b.second)

    @Test
    fun `같은 줄이면 묶인다 - 정상 카드`() {
        val 차종 = 100 to 148          // 기준 글자
        assertTrue(sameRow(100 to 148, 차종))   // 자기 자신
        assertTrue(sameRow(96 to 152, 차종))    // 조금 더 큰 글자
        assertTrue(sameRow(140 to 190, 차종))   // 아래쪽이 걸침
    }

    @Test
    fun `다른 줄이면 안 묶인다`() {
        val 차종 = 100 to 148
        assertFalse(sameRow(148 to 200, 차종))  // 딱 붙어 있지만 겹치지 않는다
        assertFalse(sameRow(200 to 250, 차종))
    }

    /**
     * 🔴 **요금 못 읽음 줄이 쏟아지는 까닭으로 보이는 자리다.**
     *
     * 높이가 0이면 «열린 구간» 겹침이 어디서도 참이 안 된다 —
     * 기준 글자 자신조차 자기와 안 겹치므로 카드가 **완전히 빈다.**
     */
    @Test
    fun `높이가 0인 사각형은 자기 자신과도 안 겹친다 - 카드가 통째로 빈다`() {
        val 빈닻 = 0 to 0
        assertFalse("닻이 자기와도 안 겹친다", sameRow(0 to 0, 빈닻))
        assertFalse("멀쩡한 글자도 안 붙는다", sameRow(100 to 148, 빈닻))
        assertFalse("빈 글자도 안 붙는다", sameRow(0 to 0, 빈닻))
    }

    @Test
    fun `닻은 멀쩡한데 글자만 비면 그 글자만 빠진다`() {
        val 차종 = 100 to 148
        assertFalse(sameRow(0 to 0, 차종))       // 스크롤 밖 글자
        assertTrue(sameRow(100 to 148, 차종))    // 화면 안 글자는 그대로 붙는다
    }

    /** 계측이 «비었다»를 무엇으로 판단하는지 못박는다 */
    @Test
    fun `자리를 안 차지하는 사각형을 가려낸다`() {
        assertTrue(InsungParser.isEmptyRect(0, 0))
        assertTrue(InsungParser.isEmptyRect(500, 500))
        assertTrue("뒤집힌 것도 빈 것으로 본다", InsungParser.isEmptyRect(200, 100))
        assertFalse(InsungParser.isEmptyRect(100, 148))
    }
}
