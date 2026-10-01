package com.onedal.app.core

import com.onedal.app.models.ScreenContext

/**
 * 👆 **KEEP 결재 뒤 «닫기» — 기사님 손이 상세에 있으면 기다린다** (기사님 «알아서» → onedal-e7 · onedal-1f «가» · `KeepCloseWaitTest`).
 * 손이 [QUIET_MS] 안에 있었으면 멈출 때까지 · 첫 시도에서 [MAX_MS] 가 넘으면 그냥 누른다(다음 콜을 보러).
 * CANCEL «취소»는 계약 보호라 기다리지 않는다 — 부르는 쪽이 KEEP 일 때만 묻는다.
 */
object KeepCloseWait {
    /** 손 먼저와 같은 1초 */
    const val QUIET_MS = 1_000L
    /** e7 결정 — «닫기»를 누를 시간 */
    const val MAX_MS = 3_000L

    /** 기다릴 ms — null 이면 지금 누른다 */
    fun waitMs(nowMs: Long, firstAtMs: Long, lastHandAtMs: Long): Long? {
        if (lastHandAtMs <= 0L) return null
        val quietAt = lastHandAtMs + QUIET_MS
        val deadline = firstAtMs + MAX_MS
        if (nowMs >= quietAt || nowMs >= deadline) return null
        return minOf(quietAt, deadline) - nowMs
    }

    /** 기다렸다 누르기 전에 다시 본다 — 그사이 상세를 떠났거나(기사님이 직접 닫음) 다른 콜이면 까닭, 아니면 null */
    fun skipWhy(screenAtFirst: ScreenContext, screenNow: ScreenContext, orderAtFirst: String, orderNow: String): String? = when {
        screenNow != screenAtFirst -> "상세를 떠남(${screenAtFirst.name} → ${screenNow.name})"
        orderNow != orderAtFirst -> "다른 콜(${orderAtFirst} → ${orderNow.ifEmpty { "없음" }})"
        else -> null
    }
}
