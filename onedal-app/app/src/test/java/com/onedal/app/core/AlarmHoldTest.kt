package com.onedal.app.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * ⏳ **목록이 움직이는 동안 읽은 통과 콜은 다음 읽기에서 같은 조립이면 울린다** (기사님 «가» · onedal-1f).
 * 라이브 09-30 20:23:37 «광주 경안→한남 16,093 · 예약 없음»(위 끝 잘림) · 20:38:28 «광주 탄벌→마포 18,130 · 예약 없음»(덜 그려짐)
 * — 둘 다 내일 이후 예약 콜에 알람이 울렸다. 온전한 다음 틀에서는 탈락이었다.
 */
class AlarmHoldTest {
    private val partial2323 = 11 to "광주 경안→한남 16,093원 · 예약 없음"
    private val partial2038 = 22 to "광주 탄벌→마포 18,130원 · 예약 없음"

    @Test fun `움직이는 틀 - 20시23분37초 잘린 조립은 미루고 다음 읽기에 없으면 탈락`() {
        val h = AlarmHold()
        assertEquals(AlarmHold.Kind.HOLD, h.decide(partial2323.first, partial2323.second, moving = true, nowMs = 0).kind)
        val d = h.decide(null, null, moving = false, nowMs = 300)
        assertEquals(AlarmHold.Kind.NONE, d.kind)
        assertEquals("앞 조립 광주 경안→한남 16,093원 · 예약 없음 → 뒤 조립 없음", d.dropped)
    }

    @Test fun `움직이는 틀 - 20시38분28초 덜 그려진 조립은 온전한 틀에서 지문이 달라 탈락`() {
        val h = AlarmHold()
        h.decide(partial2038.first, partial2038.second, moving = true, nowMs = 0)
        val d = h.decide(null, null, moving = false, nowMs = 300)
        assertTrue(d.dropped!!.startsWith("앞 조립 광주 탄벌→마포 18,130원"))
    }

    @Test fun `진짜 콜 - 움직이는 중이어도 다음 읽기에 같은 지문이면 울림 · 미룬 ms`() {
        val h = AlarmHold()
        h.decide(7, "분당 이매2→강남 논현2 15,246원", moving = true, nowMs = 1000)
        val d = h.decide(7, "분당 이매2→강남 논현2 15,246원", moving = true, nowMs = 1310)
        assertEquals(AlarmHold.Kind.FIRE, d.kind)
        assertEquals(310L, d.heldMs)
    }

    @Test fun `움직이는 중 지문이 다르면 탈락 뒤 새 최고 콜을 다시 미룬다 - 끝없이 미뤄지지 않는다`() {
        val h = AlarmHold()
        h.decide(1, "가", moving = true, nowMs = 0)
        val d = h.decide(2, "나", moving = true, nowMs = 300)
        assertEquals(AlarmHold.Kind.HOLD, d.kind)
        assertEquals("앞 조립 가 → 뒤 조립 나", d.dropped)
        assertEquals(AlarmHold.Kind.FIRE, h.decide(2, "나", moving = true, nowMs = 600).kind)
    }

    @Test fun `조용한 목록의 새 콜은 바로 울림`() {
        val d = AlarmHold().decide(3, "다", moving = false, nowMs = 0)
        assertEquals(AlarmHold.Kind.FIRE, d.kind)
        assertNull(d.heldMs)
    }

    @Test fun `움직이는 중 - 300ms 안 내용 바뀜 5개 이상`() {
        assertTrue(AlarmHold.isMoving(listOf(900L, 950L, 980L, 990L, 1000L), nowMs = 1000))
        assertTrue(!AlarmHold.isMoving(listOf(990L, 995L), nowMs = 1000))
        assertTrue("300ms 밖은 안 센다", !AlarmHold.isMoving(listOf(100L, 200L, 300L, 400L, 990L), nowMs = 1000))
    }
}
