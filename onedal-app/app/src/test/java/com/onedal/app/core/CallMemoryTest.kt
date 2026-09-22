package com.onedal.app.core

import com.onedal.app.models.FilterConfig
import com.onedal.app.models.FilterTally
import com.onedal.app.models.SimplifiedOfficeOrder
import com.onedal.app.plugins.insung.InsungParser
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * 🧪 #79 — **콜 잡는 중에 나타난 콜은 평가 없이 영영 삼켜진다**
 *
 * 실측(7지점 5판 16:04): 05를 잡는 동안(선점 잠금 · isActive=false) 06·07이 등장
 * → `decide()` 가 첫 줄에서 돌아섬(평가 로그 0줄) → 그런데 지문은 등재
 * → 잠금이 풀려도 «이미 본 콜»로 영영 건너뜀. 알람도 기록도 없었다.
 *
 * 실전 손실이다: 콜 하나를 잡는 10~30초 사이에 리스트에 처음 뜬 콜을 전부 잃는다
 * (규칙 ⑤ «놓치지 않는 것» 위반). 여기의 첫 검사가 그 사고를 그대로 재현한다.
 */
class CallMemoryTest {

    private fun lockedFilter() = activeFilter().copy(isActive = false)

    /** 최소한의 살아 있는 필터 — 판정이 실제로 돌 수 있는 값 */
    private fun activeFilter() = FilterConfig(
        allowedVehicleTypes = listOf("다마스"),
        isActive = true,
        isSharedMode = true,
        pickupRadiusKm = 10.0,
        minFare = 20000,
        maxFare = 1000000,
        ratePerKm = mapOf("다마스" to 554),
        destinationCity = "이천시",
        destinationRadiusKm = 1.0,
        destinationKeywords = listOf("신둔면", "관고동", "중리동"),
        customCityFilters = listOf("이천시", "이천"),
        orderKm = emptyMap(),
    )

    /** 7지점 07번 — 터미널→신둔. 5판에서 실제로 삼켜진 콜이다 */
    private fun order07() = SimplifiedOfficeOrder(
        id = "07", type = "NEW_ORDER",
        pickup = "이천터미널", dropoff = "신둔면", fare = 30000,
        timestamp = "2026-08-30T16:04:31",
        vehicleType = "다",
        rawText = "이천터미널 신둔면",
        pickupDistance = 19.1, deliveryDistance = 5.8,
    )

    private fun hash(o: SimplifiedOfficeOrder) = (o.pickup + o.dropoff + o.fare.toString()).hashCode()

    @Test
    fun `🔴 잠금 중 스캔된 콜은 잠금이 풀리면 다시 평가된다 - 영영 삼키지 않는다`() {
        val memory = CallMemory()
        val tally = FilterTally()
        val o = order07()

        // ── 16:04:31 — 05를 잡는 중(잠금). 07이 리스트에 처음 등장 ──
        val seenBefore = tally.seen
        InsungParser.decide(o, lockedFilter(), tally)
        val wasEvaluated = tally.seen > seenBefore
        assertFalse("잠금 중에는 평가가 돌지 않아야 전제가 성립한다", wasEvaluated)

        memory.onScanned(hash(o), wasEvaluated)

        // ── 잠금 해제 후 다음 스캔 — 07은 아직 평가된 적이 없다 ──
        assertFalse(
            "평가가 안 된 콜이 «이미 본 콜»로 남아 있다 — #79 그 사고다",
            memory.alreadyEvaluated(hash(o)),
        )
    }

    @Test
    fun `평가가 실제로 돈 콜은 기억되어 다시 평가하지 않는다 - 알람이 콜당 한 번인 이유`() {
        val memory = CallMemory()
        val tally = FilterTally()
        val o = order07()

        val seenBefore = tally.seen
        InsungParser.decide(o, activeFilter(), tally)
        val wasEvaluated = tally.seen > seenBefore
        assertTrue("살아 있는 필터에서는 평가가 돌아야 한다", wasEvaluated)

        memory.onScanned(hash(o), wasEvaluated)
        assertTrue(memory.alreadyEvaluated(hash(o)))
    }

    @Test
    fun `보고는 콜당 한 번 - 평가 여부와는 딴 그릇이다`() {
        val memory = CallMemory()
        val h = hash(order07())

        // 잠금 중에 스캔돼도 서버 보고(수집)는 나간다 — 처음 한 번만
        assertTrue(memory.markReportedOnce(h))
        assertFalse(memory.markReportedOnce(h))
        // 보고했다고 평가한 것이 되지는 않는다
        assertFalse(memory.alreadyEvaluated(h))
    }

    @Test
    fun `클릭 직전 선등재는 평가 기억에 든다 - 반송 후 재클릭 방지`() {
        val memory = CallMemory()
        val h = hash(order07())
        memory.markEvaluated(h)
        assertTrue(memory.alreadyEvaluated(h))
    }

    @Test
    fun `기억이 넘치면 최근 것만 남긴다`() {
        val memory = CallMemory(maxSize = 10, keepCount = 5)
        for (h in 1..11) memory.onScanned(h, wasEvaluated = true)
        assertEquals(5, memory.evaluatedCount)
        assertTrue(memory.alreadyEvaluated(11))
        assertFalse(memory.alreadyEvaluated(1))
    }

    /**
     * 🔴 #135 — **옛 필터로 막힌 콜이 «이미 본 콜»로 잠긴다** (이천 왕복 네 번째 바퀴 2026-09-15 · 폰 logcat).
     *
     * 06:10:13 B3(사음동 → 이천터미널)를 직전에 받은 상차 목록(4곳)으로 막았다 → 같은 순간 새 목록(10~11곳)을 받았다
     * → 06:10:48 «⏭️ [이미 본 콜] 사음동 → 중리동» — 새 목록으로 다시 판정하지 않았다.
     * 상차 목록은 차가 0.5km 움직일 때마다 바뀌어 «가까워지면 올라온다»가 뜻인데, 한 번 막힌 콜이 영영 막힌다.
     */
    private fun b3() = SimplifiedOfficeOrder(
        id = "B3", type = "NEW_ORDER", pickup = "사음동", dropoff = "중리동", fare = 50000,
        timestamp = "2026-09-15T06:10:13", vehicleType = "다",
        rawText = "사음동 중리동", pickupDistance = 2.9, deliveryDistance = 3.3,
    )

    @Test
    fun `🔴 옛 필터로 막힌 콜은 필터 버전이 바뀌면 다시 판정한다 - 가까워지면 올라온다`() {
        val memory = CallMemory()
        val o = b3()
        memory.onFilterVersion("v1")

        // ── 06:10:13 — 옛 상차 목록(4곳 · 사음동 없음)으로 판정 → 막힘 ──
        val old = activeFilter().copy(pickupKeywords = listOf("신둔면", "도척면", "곤지암읍", "초월읍"))
        val tally = FilterTally()
        val passedOld = InsungParser.decide(o, old, tally)
        assertFalse("전제: 옛 목록으로는 막힌다", passedOld)
        memory.onScanned(hash(o), wasEvaluated = tally.seen > 0, passed = passedOld)
        assertTrue("같은 필터에서는 다시 안 본다", memory.alreadyEvaluated(hash(o)))

        // ── 06:10:13.6 — 새 목록(사음동 듦)을 받았다 → 필터 버전이 바뀐다 ──
        memory.onFilterVersion("v2")
        assertFalse("막혔던 콜이 «이미 본 콜»로 잠겨 있다 — #135 그 사고다", memory.alreadyEvaluated(hash(o)))
        val fresh = old.copy(pickupKeywords = listOf("사음동", "중리동", "관고동", "신둔면"))
        assertTrue("새 목록으로는 통과한다", InsungParser.decide(o, fresh))
    }

    @Test
    fun `필터 버전이 바뀌어도 누른 콜과 통과한 콜은 다시 안 본다 - 반송 뒤 재클릭·알람 재울림을 막는다`() {
        val memory = CallMemory()
        memory.onFilterVersion("v1")
        memory.markEvaluated(1)                                   // 클릭 직전 선등재 (반송 뒤 재클릭 방지)
        memory.onScanned(2, wasEvaluated = true, passed = true)   // 통과 — 알람은 콜당 한 번
        memory.onScanned(3, wasEvaluated = true, passed = false)  // 막힘

        assertFalse("처음 받은 버전은 기억만 한다", memory.onFilterVersion("v1"))
        assertTrue(memory.onFilterVersion("v2"))

        assertTrue("누른 콜은 필터가 바뀌어도 다시 안 누른다", memory.alreadyEvaluated(1))
        assertTrue("통과한 콜은 필터가 바뀌어도 다시 안 울린다", memory.alreadyEvaluated(2))
        assertFalse("막았던 콜만 다시 본다", memory.alreadyEvaluated(3))
    }

    @Test
    fun `🔴 서버 회차가 바뀌면 본 콜 기억을 비운다 - 시나리오를 다시 시작해도 같은 콜을 처음처럼 판정한다`() {
        val memory = CallMemory()
        memory.markEvaluated(1)
        assertTrue(memory.markReportedOnce(1))

        // 처음 받은 회차는 기억만 한다 — 이미 누른 콜을 다시 누르지 않게
        assertFalse(memory.onRound(0))
        assertTrue(memory.alreadyEvaluated(1))
        assertFalse(memory.onRound(0))
        assertTrue(memory.alreadyEvaluated(1))

        assertTrue(memory.onRound(1))
        assertFalse(memory.alreadyEvaluated(1))
        assertTrue(memory.markReportedOnce(1))
    }
}
