package com.onedal.app.plugins.hwamul24

import com.onedal.app.core.Reservation
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import java.time.LocalDateTime

/**
 * 📅 **화물24시 정거장 약속은 날 배지로 읽는다** — 실물 목록 «경기 시흥 정왕동 [당상] … [당착]».
 * 배지를 잡음으로 버리면 날을 영영 모른다. 상차 배지(당상·내상)는 상차 정거장, 하차 배지(당착·내착)는 하차 정거장이다.
 */
class Hwamul24ReservationTest {
    private val now = LocalDateTime.of(2026, 9, 30, 9, 0)
    private val card = listOf("경기 시흥 정왕동", "당상", "지", "15Km", "06:32", "지", "경기 안산 상록구 장상동",
        "당착", "2.5톤/윙", "당일상 당착 공파렛 50p / 10시전하차", "독차", "인수증", "50,000원")

    @Test fun `화물 글 09시 이후 상차 - 오후에 봐도 오늘 콜`() {
        val three = LocalDateTime.of(2026, 9, 30, 15, 0)
        assertEquals(0, Hwamul24Parser.promisesOf(listOf("공파렛,09시 이후 상차"), null, null, three, memo = "공파렛,09시 이후 상차").first.day)
    }

    @Test fun `당상 배지는 오늘 상차`() {
        assertEquals(Reservation(0, null), Hwamul24Parser.promisesOf(card, null, null, now).first)
    }

    @Test fun `내상 배지는 내일 상차 - 하차 배지 내착은 상차 날이 아니다`() {
        val tomorrow = card.map { if (it == "당상") "내상" else it }
        assertEquals(Reservation(1, null), Hwamul24Parser.promisesOf(tomorrow, null, null, now).first)
        val arriveTomorrow = card.map { if (it == "당착") "내착" else it }
        assertEquals(Reservation(0, null), Hwamul24Parser.promisesOf(arriveTomorrow, null, null, now).first)
    }

    @Test fun `배지는 꼬리표로 남는다 - 날 · 상하차 방법 · 독차는 화면 차례 그대로 · 인수증은 돈 묶음 몫`() {
        assertEquals("당상 지 지 당착 독차", Hwamul24Parser.badgesOf(card))
        assertNull(Hwamul24Parser.badgesOf(listOf("경기 시흥 정왕동", "50,000원")))
    }

    @Test fun `배지가 없으면 예약이 아니다`() {
        assertEquals(Reservation.NONE to Reservation.NONE, Hwamul24Parser.promisesOf(listOf("경기 시흥 정왕동", "50,000원"), null, null, now))
    }

    /** 🔴 하차 배지 «내착» · 화물 글 «10시전하차»는 하차 정거장 날 · 시각이다 — 버리지 않는다 */
    @Test fun `내착 10시전하차는 하차 정거장 내일 10시`() {
        val o = Hwamul24Parser(android.content.ContextWrapper(null)).parse(card.map { if (it == "당착") "내착" else it })
        assertEquals(listOf(0, null), listOf(com.onedal.app.core.firstPickupStop(o)?.requestedDay, com.onedal.app.core.firstPickupStop(o)?.requestedTime))
        assertEquals(listOf(1, "10:00"), listOf(com.onedal.app.core.lastDropoffStop(o)?.requestedDay, com.onedal.app.core.lastDropoffStop(o)?.requestedTime))
    }
}
