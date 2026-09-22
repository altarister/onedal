package com.onedal.app.plugins.hwamul24

import com.onedal.app.plugins.hwamul24.Hwamul24CardGrouping.Cell
import com.onedal.app.plugins.hwamul24.Hwamul24CardGrouping.bodyIndices
import com.onedal.app.plugins.hwamul24.Hwamul24CardGrouping.cards
import com.onedal.app.plugins.hwamul24.Hwamul24CardGrouping.fareOf
import com.onedal.app.plugins.hwamul24.Hwamul24CardGrouping.pickupDistanceOf
import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * 🧩 **화물24시 카드를 묶는가** (폰 실측 좌표)
 *
 * 카드를 한 장도 못 묶으면 화면을 24시로 알아보고 파서도 골랐는데 콜이 하나도 안 올라온다:
 * ```
 * 👁️ [리스트 스캔] 텍스트노드 126 · 콜그룹 0 · 통과 0 · 요금실패 0
 * ```
 *
 * 🔴 **함정 둘** — 화면이 숫자와 단위를 **따로** 그린다.
 *   ① 한 덩어리(`30,000원`)와 두 조각(`30,000`+`원`)을 다 요금으로 읽어야 한다
 *   ② 두 조각은 **«바로 다음 조각»이 아니라 같은 줄 오른쪽의 «원»**으로 찾는다. 요금은 큰 글자,
 *      단위는 작은 글자라 `top` 이 어긋나고, 위에서 아래로 정렬하면 **같은 줄의 왼쪽
 *      글자들이 사이에 끼어든다.**
 *
 * 아래 좌표는 **폰에서 그대로 뜬 것**이다 (`uiautomator dump`).
 */
class Hwamul24CardGroupingTest {

    /** 화면 순서대로 줄을 쌓는다 — 한 줄에 여럿이면 `left` 를 달리 준다 */
    private fun screen(vararg lines: Pair<Int, List<String>>): List<Cell> =
        lines.flatMap { (top, texts) ->
            texts.mapIndexed { i, t -> Cell(t, top, i * 100) }
        }

    /** 앱이 하는 것과 같은 정렬 — 위에서 아래로, 같은 줄이면 왼쪽부터 */
    private fun sorted(cells: List<Cell>) = cells.sortedWith(compareBy({ it.top }, { it.left }))

    /**
     * 🔴 **폰에서 그대로 뜬 첫 카드** — «바로 다음 조각»만 보면 이 배치를 못 묶는다.
     *    «30,000»(top 701) 다음에 «계산서»(709)·«독차»(712)가 끼고 «원»(712)은 그 뒤다.
     */
    private fun realCard(): List<Cell> = sorted(listOf(
        Cell("경기 이천 중리동", 487, 30),
        Cell("›", 484, 531),
        Cell("경기 이천 신둔면", 487, 750),
        Cell("17", 569, 182), Cell("Km", 569, 222), Cell("05:36", 569, 804),
        Cell("당상", 574, 47), Cell("수", 574, 137), Cell("수", 574, 916), Cell("당착", 574, 978),
        Cell("다마스/전체서류봉투", 628, 30),
        Cell("30,000", 701, 852),
        Cell("계산서", 709, 140),
        Cell("독차", 712, 50),
        Cell("원", 712, 1009),
    ))

    @Test
    fun `폰 실측 카드 한 장을 묶는다`() {
        val cells = realCard()
        val got = cards(cells)
        assertEquals("카드 한 장이어야 한다", 1, got.size)
        assertEquals("대표는 요금 숫자다", "30,000", cells[got[0].fareIndex].text)
        assertEquals("카드의 끝은 «원» 이다", "원", cells[got[0].endIndex].text)
    }

    @Test
    fun `폰 실측 카드에서 요금과 거리를 읽는다`() {
        val texts = realCard().map { it.text }
        assertEquals(30000, fareOf(texts))
        assertEquals(17.0, pickupDistanceOf(texts))
    }

    @Test
    fun `한 조각 요금도 그대로 읽는다 - 실물이 어느 쪽인지 모른다`() {
        val cells = screen(
            0 to listOf("서울 강남구", "광주 초월읍"),
            40 to listOf("70,000원"),
        )
        assertEquals(listOf(2), cards(cells).map { it.endIndex })
        assertEquals(listOf(2), cards(cells).map { it.fareIndex })
        assertEquals(70000, fareOf(cells.map { it.text }))
    }

    @Test
    fun `카드가 여러 장이면 장마다 끝을 찾는다`() {
        val cells = sorted(listOf(
            Cell("가락동", 0, 30), Cell("70,000원", 20, 852),
            Cell("역삼동", 60, 30), Cell("200,000", 80, 852), Cell("원", 88, 1009),
            Cell("문래동", 120, 30), Cell("35,000원", 140, 852),
        ))
        assertEquals(3, cards(cells).size)
        assertEquals(listOf("70,000원", "200,000", "35,000원"),
            cards(cells).map { cells[it.fareIndex].text })
    }

    /** 🔴 화면 머리의 잔액이 카드로 읽히면 콜이 아닌 것을 콜로 올린다 (실측 좌표) */
    @Test
    fun `잔액 줄은 요금이 아니다 - 같은 줄에 낱말이 있다`() {
        val cells = sorted(listOf(
            Cell("ID : ", 257, 30), Cell("38616", 257, 90),
            Cell("잔액 : ", 257, 807), Cell("221,047", 257, 891), Cell("원", 257, 1015),
            Cell("가락동", 487, 30),
            Cell("30,000", 701, 852), Cell("원", 712, 1009),
        ))
        val got = cards(cells)
        assertEquals("잔액을 빼고 카드 한 장이어야 한다", 1, got.size)
        assertEquals("30,000", cells[got[0].fareIndex].text)
    }

    /**
     * 🔴 **첫 카드가 머리 줄을 삼키면 그 안의 잔액이 요금이 된다** (폰 실측:
     *    `상차=최대, 요금=247947`). 카드는 «이전 카드 끝 다음»부터라 첫 장은 화면 맨 위부터다.
     *    그래서 묶기 **전에** 머리 줄을 뺀다.
     */
    @Test
    fun `머리 줄은 카드에 안 들어간다 - 첫 카드가 통째로 삼키던 것`() {
        val cells = sorted(listOf(
            Cell("잔액 : ", 257, 807), Cell("388,276", 257, 891), Cell("원", 257, 1015),
            Cell("성공", 372, 798), Cell("0", 372, 857), Cell("건/최대", 372, 877),
            Cell("15", 372, 975), Cell("건", 372, 1015),
            Cell("경기 이천 사음동", 487, 30),
            Cell("50,000", 701, 852), Cell("원", 712, 1009),
        ))
        val body = bodyIndices(cells).map { cells[it] }
        // 머리 줄 글자가 한 조각도 남지 않는다
        for (bad in listOf("잔액 : ", "388,276", "건/최대", "성공")) {
            assertEquals("머리 줄 '$bad' 이 남았다", false, body.any { it.text == bad })
        }
        val got = cards(body)
        assertEquals(1, got.size)
        assertEquals(50000, fareOf(body.subList(0, got[0].endIndex + 1).map { it.text }))
    }

    @Test
    fun `잔액이 한 덩어리로 와도 요금이 아니다`() {
        val cells = sorted(listOf(
            Cell("잔액 : 221,047원", 257, 807),
            Cell("가락동", 487, 30),
            Cell("30,000", 701, 852), Cell("원", 712, 1009),
        ))
        assertEquals(1, cards(cells).size)
    }

    /** 숫자만 있고 «원»이 같은 줄 오른쪽에 없으면 요금이 아니다 */
    @Test
    fun `같은 줄 오른쪽에 원이 없으면 요금이 아니다`() {
        val cells = sorted(listOf(
            Cell("가락동", 0, 30),
            Cell("17", 569, 182), Cell("Km", 569, 222),
            Cell("1,234", 600, 30),
            Cell("원", 900, 1009),   // «원» 이 있지만 **다른 줄**이다
        ))
        assertEquals(emptyList<Int>(), cards(cells).map { it.endIndex })
    }

    @Test
    fun `요금이 하나도 없으면 빈 목록이다 - 0 으로 지어내지 않는다`() {
        assertEquals(emptyList<Int>(), cards(screen(0 to listOf("화물정보", "자동새로고침"))).map { it.endIndex })
        assertEquals(0, fareOf(listOf("화물정보", "자동새로고침")))
    }

    // ─────────────────────── 거리 ───────────────────────

    @Test
    fun `거리 - 한 조각도 두 조각도 읽는다`() {
        assertEquals(11.0, pickupDistanceOf(listOf("당상", "11Km", "06:31")))
        assertEquals(17.0, pickupDistanceOf(listOf("당상", "17", "Km", "05:36")))
    }

    /** 🔴 못 읽으면 null — 0 으로 지어내면 «상차지가 코앞»으로 읽혀 경로 밖 콜이 통과한다 */
    @Test
    fun `거리가 없으면 null 이다 - 0 으로 지어내지 않는다`() {
        assertEquals(null, pickupDistanceOf(listOf("가락동", "70,000원")))
        assertEquals(null, pickupDistanceOf(listOf("14", "06:31")))
    }
}
