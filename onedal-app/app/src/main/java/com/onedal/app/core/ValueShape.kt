package com.onedal.app.core

/**
 * 🔢 **글자가 아니라 «값»인 것을 이름표로 바꾼다** — 모은 글자(`ScreenWords`)가 요금·시각마다 새 낱말로 불어나지 않게 (reviews/24).
 * 짝은 서버 도구 `onedal-web/scripts/lib/wordKinds.mjs` 의 `VALUE_SHAPES` (`ValueShapePairTest` 가 정규식 글자와 이름표를 문다).
 * 모양 자체가 처음 보이면(«9월30일» 꼴) 이름표로 안 바뀐 채 올라간다 — 그게 배차망 형식이 바뀐 신호다.
 */
object ValueShape {
    val SHAPES: List<Pair<Regex, String>> = listOf(
        Regex("""^[\d,.]+$""") to "<숫자>",
        Regex("""^\d+(\.\d+)?(km|m)$""") to "<거리>",
        Regex("""^\d{1,2}:\d{2}$""") to "<시각>",
        Regex("""^\d{1,2}시(\d{1,2}분?|반)?$""") to "<시각>",
        Regex("""^\d+분( 내)?$""") to "<남은 시간>",
        Regex("""^\d{1,2}/\d{1,2}\([월화수목금토일]\)$""") to "<날짜>",
        Regex("""^\d{1,2}일$""") to "<날짜>",
        Regex("""^0\d{1,2}-\d{3,4}-\d{4}$""") to "<전화>",
        Regex("""^\d+(\.\d+)?만\s?원$""") to "<금액>",
        Regex("""^[\d,]+원$""") to "<금액>",
    )

    fun normalize(token: String): String =
        SHAPES.firstOrNull { (re, _) -> re.matches(token) }?.second ?: token
}
