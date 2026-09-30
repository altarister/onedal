package com.onedal.app.core.engine

/**
 * ⏩ **앱이 연 나쁜 콜 상세를 판정 뒤 일찍 접는다** (기사님 «가» · onedal-ab 안 · `DetailFoldTest`).
 *
 * 서버가 판정 뒤 목록 보고 응답 맨 위에 foldAfter{orderId, remainSec, remainMs}를 싣는다 — 🔴이거나 벨 점수 미만이고 앱이 연 콜일 때만.
 * 남은 시간(remainMs · 없으면 remainSec)은 서버 시계로 잰 값이라 폰 시계와 무관하다. 앱은 받은 때부터 그 초 뒤에 뒤로 간다. 몇 초인지는 서버(shared)가 정한다.
 * 앱도 한 번 더 막는다: 같은 콜 · 앱이 연 콜 · 지금 확정 전 상세 · 새 마감이 원래(pickerAlarmDetailSec) 마감보다 이를 때만.
 */
object DetailFold {
    /** 새 마감(부팅 기준 ms) — 줄이지 않으면 null */
    fun newDeadlineMs(
        currentDeadlineMs: Long?,
        receivedAtMs: Long,
        remainMs: Long,
        sameOrder: Boolean,
        openedByApp: Boolean,
        onPreConfirmDetail: Boolean,
    ): Long? {
        if (whyNot(currentDeadlineMs, receivedAtMs, remainMs, sameOrder, openedByApp, onPreConfirmDetail) != null) return null
        return receivedAtMs + maxOf(0L, remainMs)
    }

    /** 당기지 않는 까닭 — 당기면 null (로그 «⏩ [foldAfter 받음]») */
    fun whyNot(
        currentDeadlineMs: Long?,
        receivedAtMs: Long,
        remainMs: Long,
        sameOrder: Boolean,
        openedByApp: Boolean,
        onPreConfirmDetail: Boolean,
    ): String? = when {
        currentDeadlineMs == null -> "상세 대기 타이머 없음"
        !sameOrder -> "다른 콜"
        !openedByApp -> "손 상세"
        !onPreConfirmDetail -> "확정 전 상세 아님"
        receivedAtMs + maxOf(0L, remainMs) >= currentDeadlineMs -> "원래 마감이 더 이름"
        else -> null
    }
}
