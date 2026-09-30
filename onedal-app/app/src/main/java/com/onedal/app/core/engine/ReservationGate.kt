package com.onedal.app.core.engine

import com.onedal.app.models.SimplifiedOfficeOrder

/**
 * 📅 **예약 필터 — 세 배차망 공통 한 벌** (예약콜 1단계 · 기사님 «가» · `ReservationGateTest`).
 *
 * «내일 걸 오늘 잡는다면 사고다 — 확실하게 필터링할 수 있어야 한다» (기사님).
 * - 목록(`passesList`): **확실한** 다른 날만 막는다 — 날 모름은 상세까지 들여 채운다(목록에서 막으면 오늘 예약콜을 놓친다)
 * - 채운 뒤(`passesAfterFill`): 날 모름도 막는다 — 확정·수락 앞의 마지막 문이다
 *
 * 값은 서버 필터 `reservationMode` — today(오늘 콜만) · tomorrowToo(내일 콜도) · tomorrowOnly(내일 콜만).
 * 🔴 없거나 모르는 값이면 오늘 콜만 — 안전한 쪽.
 */
object ReservationGate {
    const val TODAY = "today"
    const val TOMORROW_TOO = "tomorrowToo"
    const val TOMORROW_ONLY = "tomorrowOnly"

    fun modeOf(raw: String?): String =
        raw?.takeIf { it == TODAY || it == TOMORROW_TOO || it == TOMORROW_ONLY } ?: TODAY

    /** 예약 표시가 없다 — 보통 콜 */
    private fun unmarked(o: SimplifiedOfficeOrder) = o.reserved != true
    /** 예약인데 날을 모른다 */
    private fun dayUnknown(o: SimplifiedOfficeOrder) = o.reserved == true && o.reservedDay == null

    fun passesList(o: SimplifiedOfficeOrder, mode: String?): Boolean {
        val day = o.reservedDay
        return when (modeOf(mode)) {
            TOMORROW_TOO -> day == null || day <= 1
            TOMORROW_ONLY -> dayUnknown(o) || day == 1
            else -> day == null || day <= 0
        }
    }

    fun passesAfterFill(o: SimplifiedOfficeOrder, mode: String?): Boolean {
        val day = o.reservedDay
        return when (modeOf(mode)) {
            TOMORROW_TOO -> unmarked(o) || day == 0 || day == 1
            TOMORROW_ONLY -> day == 1
            else -> isToday(o)
        }
    }

    /** 📅 로그에 적는 예약 낱말 — 픽커 채점기(`pickerAlarmGrade.mjs`)가 이 낱말로 콜의 예약을 되살린다 */
    fun wordOf(o: SimplifiedOfficeOrder): String = when {
        unmarked(o) -> "없음"
        o.reservedDay == null -> "날 모름"
        o.reservedDay == 0 -> "오늘"
        o.reservedDay == 1 -> "내일"
        else -> "${o.reservedDay}일 뒤"
    }

    /** 📅 오늘 콜인가 — 예약 표시가 없거나 오늘(0)일 때만. 앱이 확정을 누르는 조건이다 */
    fun isToday(o: SimplifiedOfficeOrder): Boolean = unmarked(o) || o.reservedDay == 0
}
