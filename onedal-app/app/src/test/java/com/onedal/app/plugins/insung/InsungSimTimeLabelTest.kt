package com.onedal.app.plugins.insung

import com.onedal.app.core.LocationTextAnalyzer
import com.onedal.app.core.Reservation
import com.onedal.app.core.engine.ReservationGate
import com.onedal.app.models.SimplifiedOfficeOrder
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDateTime

/**
 * 📅 **시뮬 인성 목록의 새 시각 꼴을 앱이 맞게 가른다** (onedal-sim 93cbfbe4 · onedal-1f).
 * 시뮬이 콜 날짜로 «오전4시6/» · «낼0시20/» · «모레8시반/» · «저녁7시/»를 그린다 — 예약 딱지는 곧 올 상차에도 붙는다.
 * 앱이 «예약 + 오전4시6»을 오늘 콜로 봐야 자동 모드에서 확정까지 간다(`ReservationGate.isToday`).
 */
class InsungSimTimeLabelTest {
    private fun read(cell: String, now: LocalDateTime): Reservation =
        InsungParser.reservationOf(LocationTextAnalyzer.analyze(cell), now)

    private fun isToday(r: Reservation): Boolean = ReservationGate.isToday(
        SimplifiedOfficeOrder(id = "t", type = "LIST", pickup = "중리동", dropoff = "초월읍", fare = 50000, timestamp = "",
            reserved = r.marked, reservedDay = r.day, reservedAt = r.at))

    @Test fun `새벽 03시43분 - 오전4시6 은 오늘 04시06 · 확정까지 간다`() {
        val r = read("오전4시6/중리동", LocalDateTime.of(2026, 10, 1, 3, 43))
        assertEquals(Reservation(true, 0, "04:06"), r)
        assertTrue(isToday(r))
    }

    @Test fun `밤 23시50분 - 낼0시20 은 내일`() {
        assertEquals(1, read("낼0시20/중리동", LocalDateTime.of(2026, 10, 1, 23, 50)).day)
    }

    @Test fun `모레8시반 은 모레 08시30`() {
        assertEquals(Reservation(true, 2, "08:30"), read("모레8시반/중리동", LocalDateTime.of(2026, 10, 1, 14, 0)))
    }

    @Test fun `저녁7시 는 오늘 19시`() {
        assertEquals(Reservation(true, 0, "19:00"), read("저녁7시/중리동", LocalDateTime.of(2026, 10, 1, 14, 0)))
    }
}
