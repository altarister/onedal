package com.onedal.app.plugins.hwamul24

import com.onedal.app.plugins.hwamul24.Hwamul24CardGrouping.Cell
import com.onedal.app.plugins.hwamul24.Hwamul24CardGrouping.cards
import com.onedal.app.plugins.hwamul24.Hwamul24CardGrouping.fareAt
import com.onedal.app.plugins.hwamul24.Hwamul24CardGrouping.pickupDistanceOf
import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * 🧩 **화물24시 카드를 한 장이라도 묶는가** (2026-09-21 · 폰 확인 2026-09-14 에서 드러난 것)
 *
 * 폰에서 스캔앱이 화물24시 리스트를 **24시로는 알아봤는데** 카드를 한 장도 못 묶었다:
 * ```
 * 👁️ [리스트 스캔] 텍스트노드 51 · 콜그룹 0 · 통과 0
 * ```
 * 요금이 «200,000» 과 «원» **두 조각**으로 그려지는데, 파서는 «200,000원» 한 덩어리만
 * 요금으로 봤다. 배차망 셋 중 하나가 통째로 안 돌던 까닭이다.
 *
 * 🔴 **두 조각을 받아들이면 «잔액 : 544,864 원» 이 카드로 오인된다** — 그 줄도 숫자와
 *    «원»이 따로 온다. 그래서 같은 줄의 낱말로 가른다.
 *
 * ⚠️ **실물 화물24시 앱이 한 조각인지 두 조각인지는 모른다** — 레포에 실물 화면 추출이
 *    없다. 그래서 **둘 다** 받는다. 한쪽만 받으면 다른 쪽에서 같은 병이 난다.
 */
class Hwamul24CardGroupingTest {

    /** 화면 순서대로 줄을 쌓는다 — 한 줄에 여럿이면 `left` 를 달리 준다 */
    private fun screen(vararg lines: Pair<Int, List<String>>): List<Cell> =
        lines.flatMap { (top, texts) ->
            texts.mapIndexed { i, t -> Cell(t, top, i * 100) }
        }

    @Test
    fun `한 조각 요금을 읽는다 - 70,000원`() {
        val cells = screen(
            0 to listOf("서울 강남구", "광주 초월읍"),
            40 to listOf("70,000원"),
        )
        assertEquals(listOf(2), cards(cells).map { it.endIndex })
        // 한 조각이면 대표와 끝이 같다
        assertEquals(listOf(2), cards(cells).map { it.fareIndex })
    }

    /** 🔴 이것이 이 검사가 생긴 까닭 — 시뮬레이터가 그리는 모양이다 */
    @Test
    fun `두 조각 요금을 읽는다 - 200,000 + 원`() {
        val cells = screen(
            0 to listOf("서울 강남구", "광주 초월읍"),
            40 to listOf("200,000", "원"),
        )
        // «원»까지가 카드의 끝이고, 대표는 **숫자** 쪽이다 (진단 로그가 «원» 이라 찍히면 안 된다)
        assertEquals(listOf(3), cards(cells).map { it.endIndex })
        assertEquals(listOf(2), cards(cells).map { it.fareIndex })
    }

    @Test
    fun `카드가 여러 장이면 장마다 끝을 찾는다`() {
        val cells = screen(
            0 to listOf("가락동"), 20 to listOf("70,000원"),
            60 to listOf("역삼동"), 80 to listOf("200,000", "원"),
            120 to listOf("문래동"), 140 to listOf("35,000원"),
        )
        assertEquals(listOf(1, 4, 6), cards(cells).map { it.endIndex })
        assertEquals(listOf(1, 3, 6), cards(cells).map { it.fareIndex })
    }

    /** 🔴 화면 머리의 잔액이 카드로 읽히면 콜이 아닌 것을 콜로 올린다 */
    @Test
    fun `잔액 줄은 요금이 아니다 - 같은 줄에 낱말이 있다`() {
        val cells = screen(
            0 to listOf("ID : gracekim", "오더검색", "잔액 : ", "544,864", "원"),
            60 to listOf("가락동"),
            80 to listOf("70,000원"),
        )
        assertEquals(listOf(6), cards(cells).map { it.endIndex })
    }

    @Test
    fun `잔액이 한 덩어리로 와도 요금이 아니다`() {
        val cells = screen(
            0 to listOf("잔액 : 544,864원"),
            40 to listOf("가락동"),
            60 to listOf("70,000", "원"),
        )
        assertEquals(listOf(3), cards(cells).map { it.endIndex })
    }

    /** 숫자만 있고 «원»이 안 따라오면 요금이 아니다 — 거리·순번 같은 것들 */
    @Test
    fun `숫자 뒤에 원이 없으면 요금이 아니다`() {
        val cells = screen(
            0 to listOf("가락동"),
            20 to listOf("14", "Km"),
            40 to listOf("1,234"),
        )
        assertEquals(emptyList<Int>(), cards(cells).map { it.endIndex })
    }

    @Test
    fun `요금이 하나도 없으면 빈 목록이다 - 0 으로 지어내지 않는다`() {
        assertEquals(emptyList<Int>(), cards(screen(0 to listOf("화물정보", "자동새로고침"))).map { it.endIndex })
    }

    // ─────────────────────── 카드 안의 값 ───────────────────────

    /** 🔴 카드를 묶어도 요금을 못 읽으면 콜이 통째로 버려진다 — 같은 규칙을 써야 하는 까닭 */
    @Test
    fun `요금 - 한 조각도 두 조각도 같은 값을 읽는다`() {
        assertEquals(70000, fareAt(listOf("70,000원"), 0))
        assertEquals(200000, fareAt(listOf("200,000", "원"), 0))
        assertEquals(null, fareAt(listOf("200,000", "Km"), 0))
        assertEquals(null, fareAt(listOf("가락동"), 0))
    }

    @Test
    fun `거리 - 한 조각도 두 조각도 읽는다`() {
        assertEquals(11.0, pickupDistanceOf(listOf("당상", "11Km", "06:31")))
        assertEquals(14.0, pickupDistanceOf(listOf("당상", "14", "Km", "06:31")))
    }

    /** 🔴 못 읽으면 null — 0 으로 지어내면 «상차지가 코앞»으로 읽혀 경로 밖 콜이 통과한다 */
    @Test
    fun `거리가 없으면 null 이다 - 0 으로 지어내지 않는다`() {
        assertEquals(null, pickupDistanceOf(listOf("가락동", "70,000원")))
        // 숫자만 있고 단위가 없으면 거리가 아니다
        assertEquals(null, pickupDistanceOf(listOf("14", "06:31")))
    }

    /** 폰이 실제로 본 시뮬레이터 카드 한 장 — 이 모양을 한 장도 못 묶었다 (2026-09-14) */
    @Test
    fun `시뮬레이터 카드 한 장을 끝까지 읽는다`() {
        val texts = listOf(
            "경기 부천 오정구", ">", "인천 서구 오류동",
            "당상", "지", "14", "Km", "06:31",
            "2.5톤/윙", "독차", "인수증", "200,000", "원",
        )
        assertEquals(200000, texts.indices.firstNotNullOfOrNull { fareAt(texts, it) })
        assertEquals(14.0, pickupDistanceOf(texts))
    }
}
