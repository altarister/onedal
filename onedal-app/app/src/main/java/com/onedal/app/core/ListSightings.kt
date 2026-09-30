package com.onedal.app.core

import com.onedal.app.models.SimplifiedOfficeOrder

/**
 * 🧾 **목록 줄을 몇 번째 읽기에서 봤나** — 같은 콜이 요금만 올라 여러 줄로 기억된 것을 가른다 (`PickerSameCallTest`).
 * 픽커는 분 단위로 요금을 올린다 — «중원 성남 → 수정 수진2» 19:39:13 4,000 → 19:39:44 4,100(라이브 09-30).
 * 요금이 다르면 지문이 달라 두 줄로 기억되고, 손 상세의 목록 줄 찾기가 «여럿»으로 버렸다.
 * 두 줄이 **한 화면에 함께 뜬 적이 없으면**(본 읽기 범위가 안 겹치면) 같은 콜의 옛값·새값이다 → 마지막에 본 줄.
 * 함께 뜬 적이 있으면 서로 다른 콜이다 → 고르지 않는다(추측 금지). 최근 [MAX] 개 지문만 기억한다.
 */
object ListSightings {
    const val MAX = 500

    data class Range(val first: Long, val last: Long)

    private val ranges = object : LinkedHashMap<Int, Range>(64, 0.75f, true) {
        override fun removeEldestEntry(eldest: MutableMap.MutableEntry<Int, Range>?): Boolean = size > MAX
    }

    /** 이 지문의 줄을 [scanNo] 번째 목록 읽기에서 봤다 */
    @Synchronized fun saw(fingerprint: Int, scanNo: Long) {
        val r = ranges[fingerprint]
        ranges[fingerprint] = if (r == null) Range(scanNo, scanNo) else Range(minOf(r.first, scanNo), maxOf(r.last, scanNo))
    }

    @Synchronized fun rangeOf(fingerprint: Int): Range? = ranges[fingerprint]

    @Synchronized fun clear() = ranges.clear()

    /**
     * 같은 콜의 마지막 줄 — 후보가 모두 상차·하차가 같고(요금만 다름) · 본 범위가 서로 안 겹치면 마지막에 본 줄.
     * 한 줄이라도 본 적이 안 적혔거나 · 범위가 겹치거나 · 상차·하차가 다르면 null.
     */
    fun latestOfSameCall(cands: List<SimplifiedOfficeOrder>): SimplifiedOfficeOrder? {
        if (cands.size < 2) return cands.singleOrNull()
        if (cands.map { it.pickup to it.dropoff }.distinct().size != 1) return null
        val withRange = cands.map { it to (rangeOf(CallMemory.fingerprintOf(it)) ?: return null) }.sortedBy { it.second.first }
        if (withRange.zipWithNext().any { (a, b) -> b.second.first <= a.second.last }) return null
        return withRange.last().first
    }

    /**
     * 🍷 **같은 가게·같은 경로 쌍둥이 콜 — 낮은 요금** (기사님 «가» · `PickerTwinCallTest`).
     * 후보가 상차·하차·픽업 km·목록 태그·크기가 모두 같고 요금만 다르며, **한 화면에 함께 뜬 적이 있으면**(서로 다른 콜)
     * (가장 낮은 줄, 요금들 높은 순). 부르는 쪽은 상세에서 최종 수익을 못 읽었을 때만 부른다. 한 칸이라도 다르면 null.
     */
    fun lowestOfTwins(cands: List<SimplifiedOfficeOrder>): Pair<SimplifiedOfficeOrder, List<Int>>? {
        if (cands.size < 2) return null
        if (cands.map { listOf(it.pickup, it.dropoff, it.pickupDistance, it.tagsText, it.itemSize) }.distinct().size != 1) return null
        if (cands.map { it.fare }.distinct().size != cands.size) return null
        val ranges = cands.map { rangeOf(CallMemory.fingerprintOf(it)) ?: return null }.sortedBy { it.first }
        if (ranges.zipWithNext().none { (a, b) -> b.first <= a.last }) return null   // 함께 뜬 적 없음 = 요금만 오른 같은 콜
        return cands.minBy { it.fare } to cands.map { it.fare }.sortedDescending()
    }
}
