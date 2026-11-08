package com.onedal.app.core

import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime
import java.time.temporal.ChronoUnit

/**
 * 📅 **정거장 약속 — 며칠 뒤인가 · 몇 시인가** (`ReservationTextTest`).
 *
 * - 약속 없음 = `NONE`(둘 다 null) — 화면에 날 · 시각 · «예약» 글자가 없다
 * - day N = 폰 달력으로 N일 뒤(0 = 오늘) · at = «HH:MM» 또는 null(시각이 안 보임)
 */
data class Reservation(val day: Int?, val at: String?) {
    companion object { val NONE = Reservation(null, null) }
}

/**
 * 📅 **정거장 약속 읽기 — 상차 · 하차 · 네 배차망 공통 한 벌** (`ReservationTextTest`).
 *
 * 낱말은 배차망 공통 한국어다 — 낼·내일·내상·내착 = 1 · 모레 = 2 · 오늘·당일·당상·당착·지금상 = 0 ·
 * «N일» = 이 달 그날(지났으면 다음 달) · «M/D(요일)» = 그 날짜(지났으면 다음 해) · «H시(M|반)»·«H:MM»(«까지» 포함) = 시각.
 * 배차망마다 다른 것은 **어느 글자를 넘기나**(플러그인)뿐이다.
 *
 * - 시각은 첫 시각 하나 — 구간 «낼11-12시»는 «시»가 붙은 끝 시각 12:00(기사님께 유리한 쪽)
 * - 날 글자가 없으면 `sameDayAs`(하차는 상차 날을 넘긴다 — «낼08:20 상차 · 10:20전 하차» → 하차 날 1), 그것도 없으면 오늘(0)
 * - «예약»만 보이고 날 · 시각이 없으면 오늘(0)
 * 🔴 **정거장 쪽 글자만 넘긴다** — 원문 전체를 넘기지 않는다(«보낼»의 «낼»처럼 말 속의 글자가 걸린다 · 하차 «14시전»이 상차 약속이 된다).
 * 📅 **내일 콜은 날 표시(낼 · 내일 · 내상 · 모레 · N일 · M/D)가 있을 때만이다 — 시각만 있으면 오늘 콜이다(짐작하지 않는다).**
 *    주선사 · 화주는 내일 콜에 «낼»을 쓰고, 오늘 안 가져간 콜은 내일 다시 올린다(기사님).
 *    내일 콜을 받을지는 기사님 예약 설정(오늘 콜만 · 내일 콜도)이 정한다.
 */
object ReservationText {

    private val TOMORROW = Regex("(?<![가-힣])(낼|내일|내상|내착)")
    private val DAY_AFTER = Regex("(?<![가-힣])모레")
    private val TODAY = Regex("오늘|당일|당상|당착|지금상")
    private val MONTH_DATE = Regex("""(\d{1,2})/(\d{1,2})\s*\(""")
    private val DAY_OF_MONTH = Regex("""(?<![\d/])(\d{1,2})일""")
    private val CLOCK = Regex("""(\d{1,2}):(\d{2})""")
    private val HOUR = Regex("""(오전|오후|저녁|밤|낮|새벽)?\s*(\d{1,2})시\s*(반|(\d{1,2})분?)?""")
    /** «낼8» — 인성이 «시»를 빼고 적는 꼴 */
    private val BARE_HOUR_AFTER_TOMORROW = Regex("""낼\s*(\d{1,2})(?![\d시:])""")

    /** 📅 이 글자에 약속 표시(날 · 시각 · «예약»)가 있나 — 칸 앞 토막이 약속 토막을 고를 때. 날 계산이 아니라 표시만 보므로 «31일» · «2/29» 가 다 있는 날을 기준으로 읽는다 */
    fun hasMark(text: String): Boolean = read(text, MARK_PROBE).day != null
    private val MARK_PROBE: LocalDateTime = LocalDateTime.of(2000, 1, 1, 0, 0)

    fun read(text: String?, now: LocalDateTime, sameDayAs: Int? = null): Reservation {
        val t = text?.trim().orEmpty()
        if (t.isEmpty()) return Reservation.NONE

        val today = now.toLocalDate()
        val explicitDay: Int? = when {
            DAY_AFTER.containsMatchIn(t) -> 2
            TOMORROW.containsMatchIn(t) -> 1
            TODAY.containsMatchIn(t) -> 0
            else -> monthDateOffset(t, today) ?: dayOfMonthOffset(t, today)
        }
        val time = timeOf(t)
        if (explicitDay == null && time == null && !t.contains("예약")) return Reservation.NONE
        /* 📅 날 글자가 없으면 넘겨받은 날(하차는 상차 날) · 그것도 없으면 오늘 — 지금보다 이른 시각을 내일로 짐작하지 않는다 */
        return Reservation(explicitDay ?: sameDayAs ?: 0, time?.let { "%02d:%02d".format(it.hour, it.minute) })
    }

    /** 📅 상차 · 하차 정거장 약속을 한 번에 — 하차 쪽 글자도 같은 함수로 읽고, 하차 날 글자가 없으면 상차 날을 넘긴다 */
    fun readStops(pickupText: String?, dropoffText: String?, now: LocalDateTime): Pair<Reservation, Reservation> {
        val pickup = read(pickupText, now)
        return pickup to read(dropoffText, now, sameDayAs = pickup.day)
    }

    private fun monthDateOffset(t: String, today: LocalDate): Int? {
        val m = MONTH_DATE.find(t) ?: return null
        val month = m.groupValues[1].toInt()
        val dom = m.groupValues[2].toInt()
        if (month !in 1..12 || dom !in 1..31) return null
        var date = runCatching { LocalDate.of(today.year, month, dom) }.getOrNull() ?: return null
        if (date.isBefore(today)) date = runCatching { date.plusYears(1) }.getOrNull() ?: return null
        return ChronoUnit.DAYS.between(today, date).toInt()
    }

    private fun dayOfMonthOffset(t: String, today: LocalDate): Int? {
        val dom = DAY_OF_MONTH.find(t)?.groupValues?.get(1)?.toInt() ?: return null
        if (dom !in 1..31) return null
        var base = today.withDayOfMonth(1)
        if (dom < today.dayOfMonth) base = base.plusMonths(1)
        if (dom > base.lengthOfMonth()) return null
        return ChronoUnit.DAYS.between(today, base.withDayOfMonth(dom)).toInt()
    }

    private fun timeOf(t: String): LocalTime? {
        CLOCK.find(t)?.let { m ->
            return clock(m.groupValues[1].toInt(), m.groupValues[2].toInt())
        }
        HOUR.find(t)?.let { m ->
            var h = m.groupValues[2].toInt()
            val min = when {
                m.groupValues[3] == "반" -> 30
                m.groupValues[4].isNotEmpty() -> m.groupValues[4].toInt()
                else -> 0
            }
            when (m.groupValues[1]) {
                "오후", "저녁", "밤" -> if (h < 12) h += 12
                "낮" -> if (h in 1..6) h += 12
            }
            return clock(h, min)
        }
        BARE_HOUR_AFTER_TOMORROW.find(t)?.let { m -> return clock(m.groupValues[1].toInt(), 0) }
        return null
    }

    private fun clock(h: Int, m: Int): LocalTime? =
        if (h in 0..23 && m in 0..59) LocalTime.of(h, m) else null
}
