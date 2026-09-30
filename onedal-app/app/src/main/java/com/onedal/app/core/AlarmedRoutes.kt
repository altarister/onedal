package com.onedal.app.core

import com.onedal.app.models.SimplifiedOfficeOrder

/**
 * 🔔 **«이 콜로 이미 알람을 냈나» — 열쇠는 상차+하차(요금 뺌)** (기사님 «금액이 바뀌면 다시 판정» · `AlarmedRoutesTest`).
 *
 * 판정용 콜 기억(`CallMemory` · 상차+하차+요금)은 그대로다 — 요금이 오르면 다시 판정한다.
 * 이 기억은 통과한 콜을 두고 둘만 본다:
 * - **셈함** — 성적표 passedNew(서버 필터 알람)에 이미 셌나. 요금만 올라 계속 통과해도 다시 안 센다.
 * - **울림 함** — 폰이 이 경로로 소리를 냈나(스크롤로 화면 밖에 나갔다 와도 다시 안 운다).
 * - **열기 함** — 폰이 소리를 내고 목록 줄을 눌러 열었나. 셈만 하고 못 연 콜(서버 심사 중 · 알람 미룸)은 다음 읽기에 연다.
 * 요금이 모자라 떨어졌던 콜이 요금이 올라 처음 통과하면 새로 센다 — 떨어진 콜은 셈한 적이 없다.
 *
 * - 동 없이 덜 읽은 줄(«분당→강남»)은 토막이 부분집합이면 같은 열쇠다(`mergePartialRows` 와 같은 규칙).
 * - 목록에서 [FORGET_MS] 넘게 안 보이면 잊는다 — 남에게 간 뒤 같은 경로로 새 콜이 뜨면 새 콜이다.
 *   (그날로 잡으면 매일 같은 매장 새 콜을 놓치고, 30분 창이면 종일 남은 콜이 30분마다 다시 운다 · 라이브 09-30 16,093 한남 02:54~22시)
 * - 상차나 하차를 모르면 열쇠가 없다 — 지금처럼 지문마다 센다.
 */
class AlarmedRoutes(private val forgetMs: Long = FORGET_MS) {
    companion object {
        const val FORGET_MS = 10 * 60_000L
    }

    private class Entry(var pickup: Set<String>, var dropoff: Set<String>, var lastSeenMs: Long, var fare: Int) {
        var counted = false
        var sounded = false
        var opened = false
    }

    private val entries = mutableListOf<Entry>()

    private fun tokens(s: String) = s.trim().split(Regex("""\s+""")).filter { it.isNotEmpty() }.toSet()

    private fun find(o: SimplifiedOfficeOrder): Entry? {
        val p = tokens(o.pickup); val d = tokens(o.dropoff)
        if (p.isEmpty() || d.isEmpty()) return null
        return entries.firstOrNull { e ->
            (e.pickup.containsAll(p) && e.dropoff.containsAll(d)) || (p.containsAll(e.pickup) && d.containsAll(e.dropoff))
        }
    }

    private fun entryOf(o: SimplifiedOfficeOrder, nowMs: Long): Entry? {
        val p = tokens(o.pickup); val d = tokens(o.dropoff)
        if (p.isEmpty() || d.isEmpty()) return null
        val e = find(o) ?: Entry(p, d, nowMs, o.fare).also { entries.add(it) }
        if (p.size + d.size > e.pickup.size + e.dropoff.size) { e.pickup = p; e.dropoff = d }   // 자세한 쪽을 남긴다
        e.lastSeenMs = nowMs
        return e
    }

    /** 이번 목록 읽기에 보인 콜들 — 있는 열쇠의 «마지막으로 본 때»를 새로 하고, 오래 안 보인 열쇠는 잊는다 */
    fun seen(orders: List<SimplifiedOfficeOrder>, nowMs: Long) {
        orders.forEach { o -> find(o)?.lastSeenMs = nowMs }
        entries.removeAll { nowMs - it.lastSeenMs > forgetMs }
    }

    /** 통과한 콜 — 이 열쇠로 처음 세면 true(셈함 표시). 열쇠가 없으면 늘 true */
    fun countIfNew(o: SimplifiedOfficeOrder, nowMs: Long): Boolean {
        val e = entryOf(o, nowMs) ?: return true
        if (e.counted) return false
        e.counted = true
        e.fare = o.fare
        return true
    }

    /**
     * 폰 소리 — 이 열쇠로 처음 울리면 true(울림 함 표시). 스크롤로 화면 밖에 나갔다 돌아와도 다시 안 운다(10분 안 보이면 잊음).
     * 소리 기억은 여기 한 곳(라이브 10-01 00:31:28 · 00:31:40 16,093 한남이 다시 울었다 — 옛 «이번 스캔에 보인 지문만» 기억).
     */
    fun soundIfNew(o: SimplifiedOfficeOrder, nowMs: Long): Boolean {
        val e = entryOf(o, nowMs) ?: return true
        if (e.sounded) return false
        e.sounded = true
        return true
    }

    /** 이 열쇠로 이미 폰이 알람을 내고 열었나 */
    fun opened(o: SimplifiedOfficeOrder): Boolean = find(o)?.opened == true

    fun markOpened(o: SimplifiedOfficeOrder, nowMs: Long) {
        entryOf(o, nowMs)?.let { it.opened = true; it.counted = true }
    }

    /** 처음 셈했을 때의 요금 — 로그용 */
    fun firstFareOf(o: SimplifiedOfficeOrder): Int? = find(o)?.fare
}
