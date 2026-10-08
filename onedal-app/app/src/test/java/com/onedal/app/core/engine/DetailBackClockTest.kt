package com.onedal.app.core.engine

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * ⏱️ **상세 대기 · 빨리 접기의 차례** (`DetailBackClock`) — 걸기 · 손 · 접기 · 시간이 됨 · 풀기.
 * 이 칸들이 서비스 안에 흩어져 있을 때 차례 하나가 빠져도(손으로 푼 콜을 기억 안 함 · 이미 걸린 타이머를 또 걺 등) 동작 검사가 없었다.
 */
class DetailBackClockTest {
    private val noop = Runnable { }
    private fun armed(now: Long = 1_000L, delay: Long = 30_000L) = DetailBackClock().apply { arm(now, delay, "앱", noop) }

    @Test fun `걸면 마감과 원래 마감이 같고 걸려 있다`() {
        val c = armed()
        assertTrue(c.armed); assertEquals(31_000L, c.deadlineMs); assertEquals(31_000L, c.origDeadlineMs); assertEquals("앱", c.opener)
    }

    @Test fun `처음엔 안 걸려 있다 — 부르는 쪽이 armed 로 두 번 걸기를 막는다`() {
        assertFalse(DetailBackClock().armed)
    }

    @Test fun `빨리 접기는 마감을 당기고 접은 콜을 기억한다`() {
        val c = armed()
        assertNull(c.foldWhyNot("o1", 5_000L, 3_000L, sameOrder = true, openedByApp = true, onDetail = true))
        val p = c.pullFold("o1", 5_000L, 3_000L, sameOrder = true, openedByApp = true, onDetail = true)
        assertNotNull(p)
        assertEquals(8_000L, p!!.deadlineMs); assertEquals(8_000L, c.deadlineMs); assertEquals("o1", c.foldOrderId)
        assertEquals(26L, p.leftSec)
    }

    @Test fun `안 걸려 있으면 접기로 당기지 않는다`() {
        assertNull(DetailBackClock().pullFold("o1", 5_000L, 3_000L, sameOrder = true, openedByApp = true, onDetail = true))
    }

    @Test fun `손이 닿으면 당긴 마감을 원래 마감으로 되돌리고 그 콜의 접기를 더 안 받는다`() {
        val c = armed()
        c.pullFold("o1", 5_000L, 3_000L, sameOrder = true, openedByApp = true, onDetail = true)
        val rel = c.releaseOnHand("o1", 6_000L)
        assertNotNull(rel)
        assertTrue(rel!!.folded); assertEquals(25_000L, rel.rescheduleMs); assertEquals(31_000L, c.deadlineMs)
        assertNull(c.foldOrderId)
        assertEquals("상세에 손 · 풂", c.foldWhyNot("o1", 7_000L, 1_000L, sameOrder = true, openedByApp = true, onDetail = true))
    }

    @Test fun `같은 콜에 두 번째 손은 아무것도 안 한다`() {
        val c = armed()
        assertNotNull(c.releaseOnHand("o1", 6_000L))
        assertNull(c.releaseOnHand("o1", 7_000L))
    }

    @Test fun `접기 전 손 — 접혀 있지 않아 다시 걸 것은 없지만 뒤에 오는 접기를 안 받는다`() {
        val c = armed()
        val rel = c.releaseOnHand("o1", 6_000L)!!
        assertFalse(rel.folded); assertNull(rel.rescheduleMs)
        assertEquals("상세에 손 · 풂", c.foldWhyNot("o1", 7_000L, 1_000L, sameOrder = true, openedByApp = true, onDetail = true))
    }

    @Test fun `원래 마감이 이미 지났으면 다시 걸지 않는다`() {
        val c = armed()
        c.pullFold("o1", 5_000L, 3_000L, sameOrder = true, openedByApp = true, onDetail = true)
        val rel = c.releaseOnHand("o1", 40_000L)!!
        assertTrue(rel.folded); assertNull(rel.rescheduleMs)
    }

    @Test fun `다시 걸면 손으로 푼 기억과 접은 콜을 비운다`() {
        val c = armed()
        c.pullFold("o1", 5_000L, 3_000L, sameOrder = true, openedByApp = true, onDetail = true)
        c.releaseOnHand("o1", 6_000L)
        c.fire("o1")   // 시간이 됐다 — fire 는 손으로 푼 기억을 비우지 않는다 · 다음 상세에서 다시 걸 때 비운다
        c.arm(8_000L, 30_000L, "앱", noop)
        assertNull(c.foldReleasedOrderId); assertNull(c.foldOrderId)
        assertNull(c.foldWhyNot("o1", 9_000L, 1_000L, sameOrder = true, openedByApp = true, onDetail = true))
    }

    @Test fun `시간이 되면 걸린 자리를 비우고 — 접은 콜이 지금 콜이면 접기로 간다`() {
        val c = armed()
        c.pullFold("o1", 5_000L, 3_000L, sameOrder = true, openedByApp = true, onDetail = true)
        assertEquals(DetailBackClock.Fire.Go(folded = true), c.fire("o1"))
        assertFalse(c.armed); assertNull(c.deadlineMs); assertNull(c.foldOrderId)
    }

    @Test fun `시간이 됐는데 접은 콜이 지금 콜이 아니면 뒤로 가지 않는다`() {
        val c = armed()
        c.pullFold("o1", 5_000L, 3_000L, sameOrder = true, openedByApp = true, onDetail = true)
        assertEquals(DetailBackClock.Fire.Skip("o1"), c.fire("o2"))
        assertFalse(c.armed); assertNull(c.foldOrderId)
    }

    @Test fun `접지 않았으면 시간이 되면 그냥 간다`() {
        assertEquals(DetailBackClock.Fire.Go(folded = false), armed().fire("o1"))
    }

    @Test fun `풀면 머문 초를 주고 칸을 모두 비운다 — 안 걸려 있었으면 null`() {
        val c = armed()
        c.pullFold("o1", 5_000L, 3_000L, sameOrder = true, openedByApp = true, onDetail = true)
        c.releaseOnHand("o1", 6_000L)
        assertEquals(DetailBackClock.Cancelled(10L, "앱"), c.cancel(11_000L))
        assertFalse(c.armed); assertNull(c.deadlineMs); assertNull(c.foldOrderId); assertNull(c.origDeadlineMs); assertNull(c.foldReleasedOrderId)
        assertNull(c.cancel(12_000L))
    }
}
