package com.onedal.app.core

import com.onedal.app.plugins.kakaopicker.KakaoPickerParser
import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * 📐 **화면 글자를 읽는 순서 — 세로로 겹치면 같은 줄, 줄 안은 왼쪽부터** (`ScreenReadingOrder`).
 *
 * 🔴 top 한 값으로 줄 세우면 같은 줄의 1px 어긋남(굵은 글씨 · 목록이 막 들어와 자리 잡는 중)에
 *    좌우가 뒤집힌다 — 실물 픽커 09-30 08:04:49 «광주 경안 → 용산 한남»이 «한남 광주 → 용산 경안»으로 읽혀
 *    «누른 콜 아님»으로 막히고 알람이 두 번 울렸다.
 */
class ScreenReadingOrderTest {

    private data class N(val text: String, val top: Int, val bottom: Int, val left: Int)

    private fun order(nodes: List<N>) =
        ScreenReadingOrder.sort(nodes, { it.top }, { it.bottom }, { it.left }).map { it.text }

    @Test fun `같은 줄은 1px 어긋나도 왼쪽부터`() {
        val nodes = listOf(
            N("가", 100, 140, 10),
            N("나", 99, 139, 200),   // 1px 위 — top 만 보면 «가» 앞에 온다
            N("다", 100, 140, 400),
        )
        assertEquals(listOf("가", "나", "다"), order(nodes))
    }

    @Test fun `굵은 글씨와 작은 글씨가 같은 줄이면 같은 줄이다`() {
        val nodes = listOf(
            N("작은", 108, 132, 10),
            N("굵은", 100, 146, 200),
        )
        assertEquals(listOf("작은", "굵은"), order(nodes))
    }

    @Test fun `줄 간격이 좁은 두 줄은 겹치지 않으면 합치지 않는다`() {
        val nodes = listOf(
            N("아래 왼쪽", 131, 161, 10),
            N("위 오른쪽", 100, 130, 300),
        )
        assertEquals(listOf("위 오른쪽", "아래 왼쪽"), order(nodes))
    }

    @Test fun `조금만 걸친 윗줄 아랫줄은 다른 줄이다 - 겹침이 작은 쪽 높이의 절반 미만`() {
        val nodes = listOf(
            N("아래 왼쪽", 125, 155, 10),   // 겹침 5px · 높이 30 → 절반 미만
            N("위 오른쪽", 100, 130, 300),
        )
        assertEquals(listOf("위 오른쪽", "아래 왼쪽"), order(nodes))
    }

    /** 실물 픽커 카드 한 장 — 몸통 줄 오른쪽 동(한남)이 1px 위로 잡힌 판 */
    @Test fun `픽커 카드 - 오른쪽 동이 1px 위여도 출발은 왼쪽 두 토막`() {
        val nodes = listOf(
            N("퀵", 900, 952, 30), N("반나절", 900, 952, 100), N("중형", 900, 952, 200),
            N("예약", 900, 952, 280), N("내일", 900, 952, 360), N("용산", 901, 953, 500),
            N("16,093", 935, 987, 900),
            N("4.7km", 966, 1016, 30), N("광주", 966, 1016, 180), N("경안", 966, 1016, 280),
            N("한남", 965, 1015, 500),
        )
        val sorted = ScreenReadingOrder.sort(nodes, { it.top }, { it.bottom }, { it.left })
        val cards = KakaoPickerParser.groupByFare(
            sorted.map { Triple(it.text, (it.top + it.bottom) / 2, it.left + 20) })
        assertEquals(1, cards.size)
        val order = KakaoPickerParser(null).parse(cards[0].second)
        assertEquals("광주 경안", order.pickup)
        assertEquals("용산 한남", order.dropoff)
    }
}
