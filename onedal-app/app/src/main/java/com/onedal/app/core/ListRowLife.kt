package com.onedal.app.core

import com.onedal.app.models.SimplifiedOfficeOrder

/**
 * ⏳ **목록 줄이 우리 목록에 얼마나 살아 있었나** — 다른 기사가 콜을 몇 초 만에 가져가는지 재는 기록이다. 운행 동작은 안 바꾼다.
 *
 * - 줄은 «상차→하차·크기»로 가른다 — 픽커는 분마다 요금을 올려 지문(요금 포함 · `CallMemory.fingerprintOf`)이 바뀐다(`ListSightings`).
 *   같은 길 · 같은 크기의 쌍둥이 콜은 한 줄로 센다.
 * - 부르는 쪽은 줄을 다 읽은 목록 읽기만 넘긴다 — 빈 틀 · 덜 읽힌 줄이 있는 읽기는 «사라짐»이 아니다.
 * - ⚠️ 목록을 내려 화면 밖으로 밀린 줄 · 목록을 떠나 있던 사이 바뀐 줄도 «사라짐»으로 센다.
 *   그래서 사라진 줄마다 «마지막으로 본 뒤 지난 시간»을 함께 돌려준다 — 그 값이 크면 사라진 때를 모르는 줄이다.
 */
object ListRowLife {
    private data class Seen(val firstMs: Long, val lastMs: Long, val label: String)

    /** @param livedMs 처음 본 때 → 마지막으로 본 때 · @param sinceLastMs 마지막으로 본 때 → 이번 읽기 */
    data class Gone(val label: String, val livedMs: Long, val sinceLastMs: Long)

    private val rows = LinkedHashMap<String, Seen>()

    fun keyOf(o: SimplifiedOfficeOrder): String = "${o.pickup}→${o.dropoff}·${o.itemSize ?: ""}"

    /** 줄을 다 읽은 목록 읽기 한 번 — 이번에 안 보인 줄을 돌려주고 잊는다 */
    @Synchronized
    fun onRead(orders: List<SimplifiedOfficeOrder>, nowMs: Long): List<Gone> {
        val seenNow = orders.associateBy { keyOf(it) }
        val gone = rows.filterKeys { it !in seenNow }.values.map { Gone(it.label, it.lastMs - it.firstMs, nowMs - it.lastMs) }
        rows.keys.retainAll(seenNow.keys)
        seenNow.forEach { (k, o) ->
            val label = "${o.pickup}→${o.dropoff} ${o.fare}원"
            rows[k] = rows[k]?.copy(lastMs = nowMs, label = label) ?: Seen(nowMs, nowMs, label)
        }
        return gone
    }

    /** 이 줄이 우리 목록에 처음 보인 뒤 지난 시간 — 지금 목록에 없으면 null */
    @Synchronized
    fun ageMs(o: SimplifiedOfficeOrder, nowMs: Long): Long? = rows[keyOf(o)]?.let { nowMs - it.firstMs }

    /** 사라진 줄 로그 한 줄 — 없으면 null */
    fun lineOf(gone: List<Gone>, rowsNow: Int): String? {
        if (gone.isEmpty()) return null
        val each = gone.joinToString(" · ") { "${it.label} 살아 있던 ${secs(it.livedMs)}(마지막 본 뒤 ${secs(it.sinceLastMs)})" }
        return "⏳ [목록 줄 사라짐] ${gone.size}줄 · 이번 읽기 ${rowsNow}줄 — $each"
    }

    fun secs(ms: Long): String = "%.1f초".format(ms / 1000.0)

    @Synchronized
    fun clear() = rows.clear()
}
