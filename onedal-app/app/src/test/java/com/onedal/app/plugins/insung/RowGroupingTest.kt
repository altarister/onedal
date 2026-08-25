package com.onedal.app.plugins.insung

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * 📏 **빈 카드의 정체를 좌표로 재현한다** (필드 테스트 1회차 ① · todo.md)
 *
 * ── 2026-08-23 실주행 3시간에서 센 것 ──
 * ```
 * 화면: LIST 인식        413 회
 * 💸 요금 못 읽음     12,467 회      ≒ 스캔당 30개
 * 1차 리스트 필터        18 회      ← 제대로 묶인 카드
 * 꿀콜 클릭               1 회
 * ```
 *
 * `💸 [요금 못 읽음]` 줄의 **뒤가 공백이었다.** 요금 숫자가 이상한 게 아니라
 * **카드에 글자가 하나도 안 묶였다.** 차종 노드(닻)는 스캔마다 30개씩 찾는데
 * 같은 줄 글자는 1~2개 카드에만 붙었다.
 *
 * 🔴 **이 검사는 고침이 아니라 재현이다.** 겹침 판정이 «열린 구간»이라, 높이가 0인
 *    사각형은 **자기 자신과도 안 겹친다** — 그러면 그 카드는 통째로 빈다.
 *    스크롤 밖 노드의 bounds 가 `(0,0,0,0)` 으로 온다면 정확히 이 모양이 된다.
 *
 * ⚠️ **아직 가설이다.** 어제 로그에는 좌표가 없어 확정할 수 없다 (그 빌드에는
 *    진단 로그가 아예 없었다 — `👁️` 줄 0개). 그래서 계측을 먼저 넣었고,
 *    다음 실주행에서 «빈 카드의 rect 가 실제로 0인가»를 본다.
 *    **원인을 못박기 전에 조건을 바꾸지 않는다** — 그러면 그게 레거시가 된다.
 */
class RowGroupingTest {

    private fun sameRow(a: Pair<Int, Int>, b: Pair<Int, Int>) =
        InsungParser.sameRow(a.first, a.second, b.first, b.second)

    @Test
    fun `같은 줄이면 묶인다 - 정상 카드`() {
        val 차종 = 100 to 148          // 닻
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
     * 🔴 **여기가 12,467회의 정체로 보이는 자리다.**
     *
     * 높이가 0이면 «열린 구간» 겹침이 어디서도 참이 안 된다 —
     * 닻 자신조차 자기와 안 겹치므로 카드가 **완전히 빈다.**
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
