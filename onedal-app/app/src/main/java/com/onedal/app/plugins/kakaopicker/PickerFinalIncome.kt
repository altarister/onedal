package com.onedal.app.plugins.kakaopicker

/**
 * 💰 **픽커 상세의 «최종 수익» — 요금을 찾는 규칙 한 벌** (실물 09-30 · 1f «가» · `PickerFinalIncomeTest`).
 *
 * 글자와 숫자가 **따로 온다** — 접근성 노드는 «최종 수익» 옆 노드가 «9,670», 사진 줄은 «11,396 P»(y368)가 «최종 수익»(y372) 바로 위.
 * 그래서 «최종 수익»이 든 칸에 숫자가 붙어 있으면 그것, 아니면 **바로 옆 칸(뒤 → 앞)의 숫자만 있는 칸**을 읽는다.
 * 🔴 칸 하나씩 «N원·NP»를 찾으면 «배송비 9,170P»를 요금으로 잡는다 — 최종 수익이 아니다.
 *
 * 부르는 곳 셋이 같은 규칙: 상세 노드(`PickerDetailOcrParser.extractFareFromTexts`) · 사진 줄(y 차례 · `PickerScreenOcr`) ·
 * 목록 줄 대조(`KakaoPickerParser.matchListCard`).
 */
object PickerFinalIncome {
    private const val LABEL = "최종 수익"
    private val SAME_ITEM = Regex("""최종 수익\s*([0-9]{1,3}(?:,[0-9]{3})+)""")
    private val NUMBER_ONLY = Regex("""^([0-9]{1,3}(?:,[0-9]{3})+)\s*P?$""")

    /** @param items 읽는 차례(노드 차례 · 사진은 y 차례)의 글자들 */
    fun of(items: List<String>): Int? {
        val i = items.indexOfFirst { it.contains(LABEL) }
        if (i < 0) return null
        SAME_ITEM.find(items[i])?.let { return toInt(it.groupValues[1]) }
        for (j in listOf(i + 1, i - 1)) {
            val m = items.getOrNull(j)?.trim()?.let { NUMBER_ONLY.find(it) } ?: continue
            return toInt(m.groupValues[1])
        }
        return null
    }

    private fun toInt(s: String): Int? = s.replace(",", "").toIntOrNull()?.takeIf { it > 0 }
}
