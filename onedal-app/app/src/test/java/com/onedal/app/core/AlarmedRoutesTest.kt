package com.onedal.app.core

import com.onedal.app.models.SimplifiedOfficeOrder
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * 🔔 **«이 콜로 이미 알람을 냈나» — 열쇠는 상차+하차(요금 뺌)** (기사님 «금액이 바뀌면 다시 판정» · 1f «가»).
 * 판정용 콜 기억(`CallMemory` · 상차+하차+요금)은 그대로다 — 요금이 오르면 다시 판정한다. 이 기억은 «셈했나 · 열었나»만 본다.
 * 라이브 09-30 21:52~22:28 서버 필터 알람 72번 — 요금만 오른 같은 콜(기흥 마북 2,000→2,375→2,600→2,825)이 새 통과로 셈해졌다.
 * 13:23 11,396 → 13:25 11,796 · 22:00 «분당 삼평→강남 일원본» → 22:01 «분당→강남» — 알람 모드가 같은 콜을 다시 열었다.
 */
class AlarmedRoutesTest {
    private fun o(pickup: String, dropoff: String, fare: Int) =
        SimplifiedOfficeOrder(id = "c", pickup = pickup, dropoff = dropoff, fare = fare, timestamp = "t", pickupDistance = 5.0)
    private val min = 60_000L

    @Test fun `요금만 오른 같은 콜은 한 번만 센다`() {
        val r = AlarmedRoutes()
        val n = listOf(2000, 2375, 2600, 2825).count { r.countIfNew(o("기흥 마북", "수지 죽전1", it), 0) }
        assertEquals(1, n)
    }

    @Test fun `요금이 모자라 떨어졌다가 올라 처음 통과하면 센다`() {
        val r = AlarmedRoutes()
        r.seen(listOf(o("기흥 마북", "수지 죽전1", 5000)), 0)   // 떨어진 콜은 셈하지 않는다 — 보이기만
        assertTrue(r.countIfNew(o("기흥 마북", "수지 죽전1", 7000), 1 * min))
    }

    @Test fun `목록에 계속 있으면 한 번 · 10분 안 보였다 다시 뜨면 새로`() {
        val r = AlarmedRoutes()
        val c = o("광주 경안", "용산 한남", 16093)
        assertTrue(r.countIfNew(c, 0))
        for (m in 1..30) r.seen(listOf(c), m * min)
        assertFalse(r.countIfNew(c, 30 * min))
        r.seen(emptyList(), 31 * min)
        r.seen(listOf(o("분당 이매1", "중구 광희", 9000)), 41 * min)
        assertTrue("10분 넘게 안 보였다 — 새 콜", r.countIfNew(c, 42 * min))
    }

    @Test fun `동 없이 덜 읽은 줄은 같은 열쇠`() {
        val r = AlarmedRoutes()
        assertTrue(r.countIfNew(o("분당 삼평", "강남 일원본", 10920), 0))
        assertFalse(r.countIfNew(o("분당", "강남", 10920), 1000))
        r.markOpened(o("분당 삼평", "강남 일원본", 10920), 0)
        assertTrue(r.opened(o("분당", "강남", 10920)))
    }

    @Test fun `연 콜은 요금만 올라도 다시 안 연다 · 셈만 한 콜은 연다`() {
        val r = AlarmedRoutes()
        val a = o("중원 상대원1", "용산 한남", 11396)
        r.countIfNew(a, 0)
        assertFalse("셈만 했고 아직 안 열었다 — 미룬 누름은 다음 읽기에 연다", r.opened(a))
        r.markOpened(a, 0)
        assertTrue(r.opened(o("중원 상대원1", "용산 한남", 11796)))
    }

    @Test fun `다른 동은 다른 콜`() {
        val r = AlarmedRoutes()
        assertTrue(r.countIfNew(o("분당 이매2", "강남 논현2", 15246), 0))
        assertTrue(r.countIfNew(o("분당 삼평", "강남 일원본", 10920), 0))
    }

    @Test fun `목록 스캔이 passedNew 를 세고 누른 뒤 열기 함을 적는다`() {
        val src = File("src/main/java/com/onedal/app/HijackService.kt").readText()
        assertTrue(src.contains("if (alarmedRoutes.countIfNew(order, nowMs)) {"))
        assertTrue(src.contains("tally.passedNew++"))
        assertTrue(src.contains("alarmedRoutes.markOpened(order, "))
        assertTrue(src.contains("if (isTarget && !alarmedRoutes.opened(order)) alarmHits.add("))
    }
}
