package com.onedal.app.core

import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime
import java.time.temporal.ChronoUnit

/**
 * 📅 **예약 — 표시가 있나 · 며칠 뒤인가 · 몇 시인가** (예약콜 1단계).
 *
 * - 표시 없음 = `NONE`(marked 거짓) — 보통 콜
 * - 날 모름 = marked 참 · day `null` — «예약»만 있고 날 · 시각이 없다. 상세가 가른다
 * - day N = 폰 달력으로 N일 뒤(0 = 오늘)
 */
data class Reservation(val marked: Boolean, val day: Int?, val at: String?) {
    companion object { val NONE = Reservation(false, null, null) }
}

/**
 * 📅 **상차 쪽 글자 하나에서 예약을 읽는다 — 세 배차망 공통 한 벌** (`ReservationTextTest`).
 *
 * 낱말은 배차망 공통 한국어다 — 낼·내일·내상 = 1 · 모레 = 2 · 오늘·당일·당상·지금상 = 0 ·
 * «N일» = 이 달 그날(지났으면 다음 달) · «M/D(요일)» = 그 날짜(지났으면 다음 해) · «H시(M|반)»·«H:MM» = 시각.
 * 배차망마다 다른 것은 **어느 글자를 넘기나**(플러그인)뿐이다.
 *
 * 🔴 **상차 쪽 글자만 넘긴다** — 하차 쪽 시각(인성 «낼8/중구봉래동»)은 도착 약속이지 상차 날이 아니다.
 *    원문 전체를 넘기지 않는다 — «보낼»의 «낼»처럼 말 속의 글자가 걸린다.
 * 🔴 «N:NN까지»(픽커 오늘 콜의 마감)는 예약이 아니다.
 * 📅 **내일 콜은 날 표시(낼 · 내일 · 내상 · 모레 · N일 · M/D)가 있을 때만이다 — 시각만 있으면 오늘 콜이다(짐작하지 않는다).**
 *    주선사 · 화주는 내일 콜에 «낼»을 쓰고, 오늘 안 가져간 콜은 내일 다시 올린다(기사님).
 *    내일 콜을 받을지는 기사님 예약 설정(오늘 콜만 · 내일 콜도)이 정한다.
 */
object ReservationText {

    private val TOMORROW = Regex("(?<![가-힣])(낼|내일|내상)")
    private val DAY_AFTER = Regex("(?<![가-힣])모레")
    private val TODAY = Regex("오늘|당일|당상|지금상")
    private val MONTH_DATE = Regex("""(\d{1,2})/(\d{1,2})\s*\(""")
    private val DAY_OF_MONTH = Regex("""(?<![\d/])(\d{1,2})일""")
    private val CLOCK = Regex("""(\d{1,2}):(\d{2})(?!\s*까지)""")
    private val HOUR = Regex("""(오전|오후|저녁|밤|낮|새벽)?\s*(\d{1,2})시\s*(반|(\d{1,2})분?)?""")
    /** «낼8» — 인성이 «시»를 빼고 적는 꼴 */
    private val BARE_HOUR_AFTER_TOMORROW = Regex("""낼\s*(\d{1,2})(?![\d시:])""")

    fun read(text: String?, now: LocalDateTime): Reservation {
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
        /* 📅 날 표시가 없으면 시각만 있어도 오늘 — 지금보다 이른 시각을 내일로 짐작하지 않는다 */
        val day = explicitDay ?: time?.let { 0 }
        val marked = explicitDay != null || time != null || t.contains("예약")
        if (!marked) return Reservation.NONE
        return Reservation(true, day, time?.let { "%02d:%02d".format(it.hour, it.minute) })
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
