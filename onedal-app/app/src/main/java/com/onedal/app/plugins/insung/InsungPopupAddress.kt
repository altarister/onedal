package com.onedal.app.plugins.insung

/**
 * 🏠 **인성 팝업의 «위치» = 전체 주소** (기사님 «상세 데이터엔 짧은 주소가 아니고 전체 주소»)
 *
 * 채우기(팝업 3장)가 모은 글자(`accumulatedDetailText`)는 «[출발지상세]»·«[도착지상세]» 머리표로 덩어리가 갈린다.
 * 그 덩어리에서 «위치»로 시작하는 줄의 값을 꺼낸다 — 줄에 값이 없고 라벨만 있으면 다음 줄이 값이다.
 * 연락처·고객 이름은 서버가 같은 글자에서 꺼낸다(`parseLocationDetails`) — 원달앱은 주소만.
 */
object InsungPopupAddress {
    const val PICKUP_TAG = "[출발지상세]"
    const val DROPOFF_TAG = "[도착지상세]"

    fun of(collected: String, tag: String): String? {
        val chunks = collected.split(tag)
        if (chunks.size < 2) return null
        val lines = chunks[1].split("\n[")[0].trim().split("\n").map { it.trim() }
        return field(lines, "위치")
    }

    private fun field(lines: List<String>, keyword: String): String? {
        val index = lines.indexOfFirst { it.startsWith(keyword) || it.contains("$keyword:") }
        if (index < 0) return null
        var content = lines[index].replace(Regex("^.*$keyword\\s*:*\\s*"), "").trim()
        if (content.isEmpty() && index + 1 < lines.size) content = lines[index + 1].trim()
        return content.ifEmpty { null }
    }
}
