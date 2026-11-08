package com.onedal.app.core.engine

import com.onedal.app.models.SimplifiedOfficeOrder
import com.onedal.app.core.firstPickupStop
import com.onedal.app.core.isReservedCall

/**
 * 📅 **예약 필터 — 네 배차망 공통 한 벌** (예약콜 1단계 · 기사님 «가» · `ReservationGateTest`).
 *
 * «내일 걸 오늘 잡는다면 사고다 — 확실하게 필터링할 수 있어야 한다» (기사님).
 * 첫 상차 날만 본다 — 약속이 없으면 보통 콜(오늘) · «예약»만 보이고 날이 없으면 정거장 약속 읽기가 날 0 을 적는다.
 * 목록 · 채운 뒤(확정 · 수락 앞의 마지막 문)가 같은 규칙이다 — 채운 뒤에는 상세에서 읽은 날로 다시 묻는다.
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

    private fun dayOf(o: SimplifiedOfficeOrder): Int? = firstPickupStop(o)?.requestedDay

    fun passes(o: SimplifiedOfficeOrder, mode: String?): Boolean {
        val day = dayOf(o)
        return when (modeOf(mode)) {
            TOMORROW_TOO -> day == null || day <= 1
            TOMORROW_ONLY -> day == 1
            else -> isToday(o)
        }
    }

    /** 📅 로그에 적는 예약 낱말 — 첫 상차 날(없음 · 오늘 · 내일 · N일 뒤) + 예약 콜이면 « 예약콜». 픽커 채점기(`pickerAlarmGrade.mjs`)가 이 낱말로 콜의 날을 되살린다 */
    fun wordOf(o: SimplifiedOfficeOrder): String {
        val day = when (val d = dayOf(o)) { null -> "없음"; 0 -> "오늘"; 1 -> "내일"; else -> "${d}일 뒤" }
        return if (isReservedCall(o)) "$day 예약콜" else day
    }

    /** 📅 오늘 콜인가 — 약속이 없거나 첫 상차 날이 오늘(0)일 때만. 앱이 확정을 누르는 조건이다 */
    fun isToday(o: SimplifiedOfficeOrder): Boolean = (dayOf(o) ?: 0) <= 0
}
