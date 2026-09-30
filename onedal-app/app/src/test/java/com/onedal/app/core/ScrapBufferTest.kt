package com.onedal.app.core

import com.onedal.app.models.SimplifiedOfficeOrder
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * 🏷️ **목록 줄의 출처(실물/시뮬)는 담을 때 정한다** (앱 교차 리뷰 · onedal-1f «가»).
 * 보낼 때의 화면 앱으로 정하면, 실물 픽커 줄이 버퍼에 있는 0.3초 안에 원달앱·홈으로 넘어갈 때 그 줄이 «sim»으로 나가 실물 통계에서 빠진다.
 */
class ScrapBufferTest {
    private fun row(id: String) = SimplifiedOfficeOrder(id = id, pickup = "분당 이매2", dropoff = "강남 논현2", fare = 15000, timestamp = "t")

    @Test fun `출처가 같으면 한 보고로 모은다`() {
        val b = ScrapBuffer()
        assertTrue(b.add(row("a"), "real"))
        assertTrue(b.add(row("b"), "real"))
        val (rows, source) = b.drain()
        assertEquals(listOf("a", "b"), rows.map { it.id })
        assertEquals("real", source)
    }

    @Test fun `출처가 바뀌면 담기 전에 먼저 보내라 - 한 보고 안에 출처가 섞이지 않는다`() {
        val b = ScrapBuffer()
        b.add(row("a"), "real")
        assertFalse("sim 줄이 real 버퍼에 섞였다", b.add(row("b"), "sim"))
        assertEquals("real" to listOf("a"), b.drain().let { it.second to it.first.map { r -> r.id } })
        assertTrue(b.add(row("b"), "sim"))
        assertEquals("sim", b.drain().second)
    }

    @Test fun `비면 출처도 없다 - 화면 바뀐 보고만이면 지금 화면 앱으로`() {
        val (rows, source) = ScrapBuffer().drain()
        assertTrue(rows.isEmpty())
        assertEquals(null, source)
    }
}
