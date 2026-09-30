package com.onedal.app.core

import com.onedal.app.models.SimplifiedOfficeOrder
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * 🔔 **폰 소리는 같은 콜(상차+하차)에 한 번 — 스크롤로 화면 밖에 나갔다 돌아와도 다시 울지 않는다** (`AlarmedRoutes` «울림 함» · onedal-1f «가»).
 * 라이브 10-01 00:31:28 · 00:31:40 16,093 한남 — «🔕 이미 알람 낸 콜» 바로 뒤에 소리가 다시 났다.
 * 소리 기억이 «이번 스캔에 보인 지문만 남긴다»여서 화면 밖에 나갔다 오면 지워졌다(기사님 «뜬금없이 소리만»).
 * 목록에서 10분 넘게 안 보이면 잊는다 — 남에게 간 뒤 같은 경로 새 콜은 새로 운다.
 */
class AlarmSoundMemoryTest {
    private fun o(fare: Int) = SimplifiedOfficeOrder(id = "c", pickup = "광주 경안", dropoff = "용산 한남", fare = fare, timestamp = "t", pickupDistance = 4.7)
    private val min = 60_000L

    @Test fun `같은 경로는 한 번만 운다 · 요금만 올라도`() {
        val r = AlarmedRoutes()
        assertTrue(r.soundIfNew(o(16093), 0))
        assertFalse(r.soundIfNew(o(16093), 1_000))
        assertFalse(r.soundIfNew(o(16500), 2_000))
    }

    @Test fun `스크롤로 화면 밖에 나갔다 돌아와도 다시 울지 않는다`() {
        val r = AlarmedRoutes()
        assertTrue(r.soundIfNew(o(16093), 0))
        r.seen(listOf(SimplifiedOfficeOrder(id = "x", pickup = "분당 삼평", dropoff = "강남 일원본", fare = 10920, timestamp = "t", pickupDistance = 5.0)), 12_000)
        assertFalse(r.soundIfNew(o(16093), 24_000))
    }

    @Test fun `10분 넘게 안 보였다 다시 뜨면 새로 운다`() {
        val r = AlarmedRoutes()
        assertTrue(r.soundIfNew(o(16093), 0))
        r.seen(emptyList(), 11 * min)
        assertTrue(r.soundIfNew(o(16093), 11 * min))
    }
}
