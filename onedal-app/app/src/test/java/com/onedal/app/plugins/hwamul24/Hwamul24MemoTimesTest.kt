package com.onedal.app.plugins.hwamul24

import com.onedal.app.core.Reservation
import org.junit.Assert.assertEquals
import org.junit.Test
import java.time.LocalDateTime

/**
 * 🕘 **화물24시 화물 글을 상차 시각과 하차 시각으로 가른다** — 한 글에 둘이 섞여 온다 (실물 ex_images/화물24시/13·35·36).
 * 가르지 않으면 «10시전하차»가 상차 시각으로 읽혀 «지난 시각 = 내일»이 된다. «다발무상»처럼 날·시각 없는 «상»은 상차가 아니다.
 */
class Hwamul24MemoTimesTest {
    private fun split(m: String) = Hwamul24MemoTimes.split(m)

    @Test fun `당일상과 전하차가 갈린다`() =
        assertEquals(Hwamul24MemoTimes.Split("당일상", "당착 10시전하차"), split("당일상 당착 공파렛 50p / 10시전하차"))

    @Test fun `당일 오전 시각 상차`() =
        assertEquals(Hwamul24MemoTimes.Split("당일오전9시30분상", "당착"), split("당일오전9시30분상 당착 지/지 4파렛"))

    @Test fun `다발무상은 상차가 아니다`() =
        assertEquals(Hwamul24MemoTimes.Split("당일오후1시상 오후1시상", "당착"), split("예약 당일오후1시상 당착 다발무상.하차해줌.오후1시상-A"))

    @Test fun `지금상 · 이후 상차`() {
        assertEquals(Hwamul24MemoTimes.Split("지금상", "당착"), split("지금상 당착 59박스 수/수-A"))
        assertEquals(Hwamul24MemoTimes.Split("09시 이후 상차", ""), split("공파렛,09시 이후 상차"))
    }

    @Test fun `시각 없는 상하차는 아무것도 아니다`() =
        assertEquals(Hwamul24MemoTimes.Split("", "당착"), split("당착/쿠팡반품건(부천1센터)/4파렛상하차"))

    @Test fun `예약은 상차 배지와 상차 글로 - 하차 시각은 안 섞인다`() {
        val now = LocalDateTime.of(2026, 9, 30, 11, 0)
        val card = listOf("경기 시흥 정왕동", "당상", "15Km", "경기 안산 상록구 장상동", "당착", "2.5톤/윙")
        assertEquals(Reservation(true, 0, "09:30"),
            Hwamul24Parser.reservationOf(card, null, now, memo = "당일오전9시30분상 당착 지/지 4파렛"))
        assertEquals(Reservation(true, 0, null),
            Hwamul24Parser.reservationOf(card, null, now, memo = "당일상 당착 공파렛 50p / 10시전하차"))
    }
}
