package com.onedal.app.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * 🔁 **반경 밖이라 막았던 콜이 가까워져 반경 안으로 들어오면 다시 판정한다** (기사님 «가» · onedal-ab 리뷰 높음 2 · onedal-1f).
 * «막았다» 기억은 필터 값이 바뀔 때만 풀려, 12km 에서 막힌 콜이 6km 까지 와도 다시 보지 않았다(좋은 콜을 놓침).
 * 막을 때 «그때 픽업 km»를 적어 두고(메모리 칸) 목록 줄 km 가 오늘 반경 안으로 들어오면 푼다. 내일 이후 콜은 집 기준 목록이라 빼고 부른다.
 */
class CloserRecheckTest {
    @Test fun `12km 에서 막힌 콜이 6km 로 오면 풀린다 · 아직 밖이면 안 풀린다`() {
        val m = CallMemory()
        m.onScanned(7, wasEvaluated = true, passed = false)
        m.rememberBlockedKm(7, 12.0)
        assertNull("아직 반경 밖", m.releaseIfCloser(7, nowKm = 11.0, radiusKm = 10.0))
        assertTrue(m.alreadyEvaluated(7))
        assertEquals(12.0, m.releaseIfCloser(7, nowKm = 6.0, radiusKm = 10.0)!!, 0.0)
        assertFalse("다시 판정", m.alreadyEvaluated(7))
    }

    @Test fun `km 를 안 적은 막음(요금·도착)은 안 푼다`() {
        val m = CallMemory()
        m.onScanned(8, wasEvaluated = true, passed = false)
        assertNull(m.releaseIfCloser(8, nowKm = 1.0, radiusKm = 10.0))
    }

    @Test fun `필터 값이 바뀌어 막은 기억을 비우면 km 도 비운다`() {
        val m = CallMemory()
        m.onFilter("v1", "a")
        m.onScanned(9, wasEvaluated = true, passed = false)
        m.rememberBlockedKm(9, 12.0)
        m.onFilter("v2", "b")
        m.onScanned(9, wasEvaluated = true, passed = false)
        assertNull("옛 km 가 남지 않는다", m.releaseIfCloser(9, nowKm = 1.0, radiusKm = 10.0))
    }

    @Test fun `스캔 고리 - 내일 이후 콜은 빼고 · 상차 축 탈락일 때만 km 를 적는다`() {
        val src = File("src/main/java/com/onedal/app/HijackService.kt").readText()
        assertTrue(src.contains("callMemory.releaseIfCloser(orderHash, order.pickupDistance, scanRadiusKm)"))
        assertTrue(src.contains("🔁 [가까워져 다시 판정]"))
        assertTrue(src.contains("if (judged.verdict == \"pickup\")"))
        assertTrue(src.contains("(order.reservedDay ?: 0) < 1"))
    }
}
