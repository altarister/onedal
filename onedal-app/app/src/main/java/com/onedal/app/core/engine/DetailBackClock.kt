package com.onedal.app.core.engine

/**
 * ⏱️ **상세 대기 · 빨리 접기의 상태와 차례 — 한 곳** (`HijackService` 의 상세 대기 타이머).
 * 확정 전 상세에 들어오면 정해진 시간 뒤 목록으로 돌아간다 · 서버 판정 뒤 «빨리 접기»로 그 마감을 당긴다 ·
 * 기사님 손이 닿으면 당긴 마감을 원래 마감으로 되돌리고 그 콜의 접기를 더 받지 않는다.
 * 여기는 칸과 차례만 — 기다림 걸기 · 1초 보고 · 뒤로 가기 · 로그는 서비스가 결과대로 한다.
 */
class DetailBackClock {
    /** 걸어 둔 «시간이 되면 할 일» — 있으면 걸려 있다(거는 곳 한 곳 · 비우는 곳은 `fire` · `cancel`) */
    var action: Runnable? = null
        private set
    var opener = ""
        private set
    var armedAtMs = 0L
        private set
    /** ⏩ 상세 대기 마감(부팅 기준) · 판정 뒤 접기로 당겼으면 그 콜 (`DetailFold`) */
    var deadlineMs: Long? = null
        private set
    var foldOrderId: String? = null
        private set
    /** ⏩ 상세 대기 원래 마감(빨리 접기 풂에 되돌릴 자리) · 기사님 손으로 빨리 접기를 푼 콜 */
    var origDeadlineMs: Long? = null
        private set
    var foldReleasedOrderId: String? = null
        private set

    val armed: Boolean get() = action != null

    /** ⏱️ 건다 — 상세 글자가 바뀔 때마다 새로 걸지 않는다(부르는 쪽이 `armed` 를 먼저 본다) */
    fun arm(nowMs: Long, delayMs: Long, opener: String, action: Runnable) {
        this.opener = opener
        armedAtMs = nowMs
        deadlineMs = nowMs + delayMs
        origDeadlineMs = nowMs + delayMs
        foldOrderId = null
        foldReleasedOrderId = null
        this.action = action
    }

    /**
     * @property folded 빨리 접기로 당겨져 있었나
     * @property rescheduleMs 원래 마감으로 다시 걸 ms — 당겨져 있었고 원래 마감이 아직 남았을 때만
     */
    data class Release(val folded: Boolean, val rescheduleMs: Long?, val origDeadlineMs: Long?, val action: Runnable?)

    /** ✋ 앱이 연 상세에 기사님 손 — 이 콜을 이미 풀었으면 null. 빨리 접기가 오기 전이어도 기억한다(뒤에 오는 접기를 받지 않는다) */
    fun releaseOnHand(orderId: String, nowMs: Long): Release? {
        if (foldReleasedOrderId == orderId) return null
        foldReleasedOrderId = orderId
        val folded = foldOrderId != null
        foldOrderId = null
        val r = action
        val orig = origDeadlineMs
        var rescheduleMs: Long? = null
        if (folded && r != null && orig != null && orig > nowMs) {
            rescheduleMs = orig - nowMs
            deadlineMs = orig
        }
        return Release(folded, rescheduleMs, orig, r)
    }

    /** ⏩ 빨리 접기를 받을 수 없는 까닭 — 받을 수 있으면 null. 손으로 푼 콜이 먼저다 */
    fun foldWhyNot(orderId: String, nowMs: Long, remainMs: Long, sameOrder: Boolean, openedByApp: Boolean, onDetail: Boolean): String? =
        if (foldReleasedOrderId == orderId) "상세에 손 · 풂"
        else DetailFold.whyNot(deadlineMs, nowMs, remainMs, sameOrder, openedByApp, onDetail)

    /** @property leftSec 당기기 전 남아 있던 초 */
    data class Pull(val deadlineMs: Long, val leftSec: Long, val action: Runnable)

    /** ⏩ 빨리 접기로 마감을 당긴다 — 걸려 있지 않거나 당길 마감이 없으면 null */
    fun pullFold(orderId: String, nowMs: Long, remainMs: Long, sameOrder: Boolean, openedByApp: Boolean, onDetail: Boolean): Pull? {
        val r = action ?: return null
        val deadline = DetailFold.newDeadlineMs(deadlineMs, nowMs, remainMs,
            sameOrder = sameOrder, openedByApp = openedByApp, onPreConfirmDetail = onDetail) ?: return null
        val leftSec = ((deadlineMs ?: nowMs) - nowMs) / 1000
        deadlineMs = deadline
        foldOrderId = orderId
        return Pull(deadline, leftSec, r)
    }

    sealed class Fire {
        /** 접을 콜이 지금 콜이 아니다 — 뒤로 가지 않는다 */
        data class Skip(val foldOrderId: String) : Fire()
        /** 시간이 됐다 — [folded] 면 서버 판정 뒤 접기 */
        data class Go(val folded: Boolean) : Fire()
    }

    /** ⏰ 시간이 됐다 — 걸어 둔 자리를 비우고, 판정 뒤 접기로 당긴 마감이면 아직 그 콜인지 본다 */
    fun fire(currentOrderId: String): Fire {
        action = null
        deadlineMs = null
        foldOrderId?.let { f ->
            if (f != currentOrderId) {
                foldOrderId = null
                return Fire.Skip(f)
            }
        }
        val folded = foldOrderId != null
        foldOrderId = null
        return Fire.Go(folded)
    }

    /** @property stayedSec 걸린 뒤 머문 초 */
    data class Cancelled(val stayedSec: Long, val opener: String)

    /** ⏹️ 푼다(콜 끝 · 목록 복귀) — 걸려 있었으면 머문 초 · 칸을 비운다 */
    fun cancel(nowMs: Long): Cancelled? {
        val was = action?.let { Cancelled((nowMs - armedAtMs) / 1000, opener) }
        action = null
        deadlineMs = null
        foldOrderId = null
        origDeadlineMs = null
        foldReleasedOrderId = null
        return was
    }
}
