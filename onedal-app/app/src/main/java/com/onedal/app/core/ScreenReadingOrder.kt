package com.onedal.app.core

/**
 * 📐 **화면 글자를 읽는 순서 — 세로로 겹치면 같은 줄, 줄 안은 왼쪽부터** (세 배차망 공통 한 벌).
 *
 * 🔴 top 한 값으로 줄 세우면 **같은 줄의 1px 어긋남에 좌우가 뒤집힌다** — 굵은 글씨와 작은 글씨는 top 이 다르고,
 *    목록에 막 들어온 순간에는 자리 잡는 중이라 한 줄이 조금씩 어긋난다. 실물 픽커에서 오른쪽 도착 동이
 *    출발 토막 사이에 끼어 «누른 콜 아님»으로 막히고 알람이 두 번 울렸다 (`ScreenReadingOrderTest`).
 *
 * 같은 줄 = **두 글자의 세로 겹침이 작은 쪽 높이의 절반 이상**. 고정 픽셀을 두지 않는다 —
 * 줄 간격은 배차망마다 달라 고정 값은 촘촘한 목록에서 윗줄·아랫줄을 한 줄로 합친다.
 * 줄의 기준은 그 줄의 첫 글자(가장 위)다 — 이웃끼리 이어 붙여 줄이 아래로 번지지 않게.
 */
object ScreenReadingOrder {

    fun <T> sort(nodes: List<T>, top: (T) -> Int, bottom: (T) -> Int, left: (T) -> Int): List<T> {
        val rows = mutableListOf<MutableList<T>>()
        for (n in nodes.sortedWith(compareBy(top, left))) {
            val row = rows.lastOrNull()
            if (row != null && sameRow(top(row[0]), bottom(row[0]), top(n), bottom(n))) row.add(n)
            else rows.add(mutableListOf(n))
        }
        return rows.flatMap { row -> row.sortedBy(left) }
    }

    private fun sameRow(topA: Int, bottomA: Int, topB: Int, bottomB: Int): Boolean {
        val shorter = minOf(bottomA - topA, bottomB - topB)
        if (shorter <= 0) return topA == topB
        val overlap = minOf(bottomA, bottomB) - maxOf(topA, topB)
        return overlap * 2 >= shorter
    }
}
