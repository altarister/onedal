package com.onedal.app.core

/**
 * ⏳ **목록이 움직이는(다시 그려지는) 동안 읽은 통과 콜은 바로 울리지 않는다** (기사님 «가» · `AlarmHoldTest`).
 * 덜 그려진 카드는 «예약 없음 · 도착 구만»으로 읽혀 내일 이후 예약 콜에 알람이 울렸다(라이브 09-30 20:23:37 · 20:38:28).
 * - 움직이는 중 = 이 읽기 직전 [MOVING_WINDOW_MS] 안 배차망 «내용 바뀜»이 [MOVING_EVENTS] 개 이상.
 *   한 개로 가르지 않는다 — 조용한 목록의 새 카드도 알림 1~2개를 내고 그 알림이 읽기를 부른다(실측 · 움직일 때 300ms 에 14~78개)
 * - 움직이는 중의 최고 통과 콜은 미룬다 → 다음 읽기(늦어도 [RECHECK_MS] 뒤 한 번 더 읽는다)에서 같은 지문이면 울린다
 * - 지문이 다르거나 없으면 «앞 조립 → 뒤 조립»을 남기고 버린다 · 그 읽기의 새 최고 콜은 다시 판단한다
 * - 조용한 목록의 새 콜은 바로 울린다
 */
class AlarmHold {
    companion object {
        const val MOVING_EVENTS = 5
        const val MOVING_WINDOW_MS = 300L
        const val RECHECK_MS = 300L

        /** 이 읽기 직전 [MOVING_WINDOW_MS] 안 «내용 바뀜»이 [MOVING_EVENTS] 개 이상인가 */
        fun isMoving(eventTimesMs: List<Long>, nowMs: Long): Boolean =
            eventTimesMs.count { nowMs - it in 0..MOVING_WINDOW_MS } >= MOVING_EVENTS
    }

    enum class Kind { FIRE, HOLD, NONE }

    /** @param heldMs 미뤘다 울리면 늦은 ms · @param dropped 미룬 콜이 다음 읽기에서 떨어졌으면 «앞 조립 … → 뒤 조립 …» */
    data class Decision(val kind: Kind, val heldMs: Long? = null, val dropped: String? = null)

    private data class Held(val fingerprint: Int, val label: String, val atMs: Long)
    private var held: Held? = null

    fun decide(bestFingerprint: Int?, bestLabel: String?, moving: Boolean, nowMs: Long): Decision {
        val h = held
        var dropped: String? = null
        if (h != null) {
            held = null
            if (bestFingerprint == h.fingerprint) return Decision(Kind.FIRE, heldMs = nowMs - h.atMs)
            dropped = "앞 조립 ${h.label} → 뒤 조립 ${bestLabel ?: "없음"}"
        }
        if (bestFingerprint == null) return Decision(Kind.NONE, dropped = dropped)
        if (moving) {
            held = Held(bestFingerprint, bestLabel.orEmpty(), nowMs)
            return Decision(Kind.HOLD, dropped = dropped)
        }
        return Decision(Kind.FIRE, dropped = dropped)
    }

    /** 목록을 떠났다 — 미룬 콜을 버린다 */
    fun clear() { held = null }
}
