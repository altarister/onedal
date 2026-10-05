package com.onedal.app.core

import com.onedal.app.models.SimplifiedOfficeOrder
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

/**
 * ⏳ **목록 줄 수명** — 다른 기사가 콜을 몇 초 만에 가져가나를 재는 기록(`ListRowLife`).
 * 실물 09-30 19:23 «분당 정자1 → 서초 서초4 15,053원»은 발견→누름 230ms 인데도 «이미 배정이 완료된 오더»였다 —
 * 그 줄이 우리 목록에 몇 초 있었나를 남겨야 «목록이 늦게 왔다»와 «우리가 늦게 눌렀다»를 가른다.
 */
class ListRowLifeTest {
    private fun o(p: String, d: String, fare: Int, size: String = "소형") =
        SimplifiedOfficeOrder(id = "$p$d$fare", type = "LIST", pickup = p, dropoff = d, fare = fare, timestamp = "", itemSize = size)

    @Before fun reset() = ListRowLife.clear()

    @Test fun `안 보인 줄은 처음 본 때부터 마지막 본 때까지 살아 있던 시간과 함께 사라진다`() {
        val a = o("분당 정자1", "서초 서초4", 15053)
        val b = o("광주 광남2", "광주 오포1", 4100)
        assertTrue(ListRowLife.onRead(listOf(a, b), 0).isEmpty())
        assertTrue(ListRowLife.onRead(listOf(a, b), 2_000).isEmpty())
        val gone = ListRowLife.onRead(listOf(b), 5_000)
        assertEquals(listOf(ListRowLife.Gone("분당 정자1→서초 서초4 15053원", 2_000, 3_000)), gone)
        assertEquals("⏳ [목록 줄 사라짐] 1줄 · 이번 읽기 1줄 — 분당 정자1→서초 서초4 15053원 살아 있던 2.0초(마지막 본 뒤 3.0초)",
            ListRowLife.lineOf(gone, 1))
    }

    @Test fun `요금만 오른 줄은 같은 줄이다 - 픽커는 분마다 요금을 올린다`() {
        ListRowLife.onRead(listOf(o("광주 초월", "송파 잠실3", 22120)), 0)
        assertTrue(ListRowLife.onRead(listOf(o("광주 초월", "송파 잠실3", 24020)), 60_000).isEmpty())
        assertEquals(90_000L, ListRowLife.ageMs(o("광주 초월", "송파 잠실3", 26220), 90_000))
    }

    @Test fun `목록에 없는 줄의 나이는 모른다`() {
        ListRowLife.onRead(listOf(o("광주 광남2", "광주 오포1", 4100)), 0)
        assertNull(ListRowLife.ageMs(o("분당 정자1", "서초 서초4", 15053), 1_000))
        assertNull(ListRowLife.lineOf(emptyList(), 3))
    }
}
