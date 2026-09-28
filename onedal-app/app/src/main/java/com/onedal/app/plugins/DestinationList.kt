package com.onedal.app.plugins

/**
 * 🧭 **도착 목록 — 세 배차망이 같은 한 규칙** (기사님 «같은 순서 · 다른 것은 인자»)
 *
 * 서버는 운행 중(경로가 있을 때) 경유 순서 목록(`orderKm`)에 실린 동을 `destinationKeywords` 에서 빼서 보낸다(같은 목록 두 번 안 싣기).
 * 그래서 도착 목록은 늘 `destinationKeywords ∪ orderKm 키` 다 — 한 배차망이라도 합치지 않으면 운행 중 도착 목록이 비어 모든 하차가 통과한다.
 * 옛 서버(중복 포함)와도 `distinct` 로 같은 집합이 된다.
 */
object DestinationList {
    fun of(destinationKeywords: List<String>, orderKeys: Collection<String>): List<String> =
        (destinationKeywords + orderKeys).filter { it.isNotEmpty() }.distinct()
}
