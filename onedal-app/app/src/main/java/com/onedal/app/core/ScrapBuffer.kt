package com.onedal.app.core

import com.onedal.app.models.SimplifiedOfficeOrder

/**
 * 🏷️ **보낼 목록 줄과 그 줄들의 출처(실물/시뮬)를 함께 든다** (`ScrapBufferTest` · 앱 교차 리뷰).
 * 출처는 **담을 때** 정한다 — 보낼 때의 화면 앱으로 정하면, 실물 픽커 줄이 버퍼에 있는 동안 원달앱·홈으로 넘어가면
 * 그 줄이 «sim»으로 나가 실물 통계에서 빠진다. 한 보고는 출처 하나라, 출처가 다른 줄은 담지 않고 «먼저 보내라»를 돌려준다.
 */
class ScrapBuffer {
    private val rows = mutableListOf<SimplifiedOfficeOrder>()
    private var source: String? = null

    /** 담았으면 true · 버퍼의 출처와 달라 못 담았으면 false — 부르는 쪽이 먼저 보내고 다시 담는다 */
    @Synchronized fun add(order: SimplifiedOfficeOrder, source: String?): Boolean {
        if (rows.isNotEmpty() && source != this.source) return false
        if (rows.isEmpty()) this.source = source
        rows.add(order)
        return true
    }

    /** 담긴 줄과 그 출처를 꺼내고 비운다 — 비었으면 (빈 목록, null) */
    @Synchronized fun drain(): Pair<List<SimplifiedOfficeOrder>, String?> {
        val out = rows.toList() to (if (rows.isEmpty()) null else source)
        rows.clear()
        source = null
        return out
    }
}
