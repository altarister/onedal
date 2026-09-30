package com.onedal.app.plugins.hwamul24

/**
 * 🕘 **화물24시 화물 글을 상차 시각과 하차 시각으로 가른다** (reviews/24 D5 · `Hwamul24MemoTimesTest`).
 *
 * 화물 글은 한 줄에 상차·하차 약속을 섞어 적는다 — «당일상 당착 공파렛 50p / 10시전하차» (실물 목록).
 * 가르지 않고 예약을 읽으면 «10시전하차»가 상차 시각이 되어 «지난 시각 = 내일»로 오늘 콜을 막는다.
 *
 * - 상차: 날·시각 뒤에 붙은 «상/상차» — «당일상» · «지금상» · «당일오전9시30분상» · «오후1시상» · «09시 이후 상차» · 배지 «당상·내상»
 * - 하차: 시각 뒤 «(전·까지) 하차/착» — «10시전하차» · 배지 «당착·내착»
 * 🔴 날·시각이 앞에 없는 «상»은 상차가 아니다 — «다발무상» · «4파렛상하차»
 */
object Hwamul24MemoTimes {
    data class Split(val pickup: String, val dropoff: String)

    private const val DAY = "(?:당일|내일|지금|낼)"
    private const val HALF = "(?:오전|오후|저녁|새벽|밤)"
    private const val CLOCK = """\d{1,2}시(?:\s*\d{1,2}분|반)?"""

    private val PICKUP = Regex(
        """$DAY$HALF?(?:$CLOCK)?\s*(?:이후\s*)?상차?(?!하)""" +
            """|$HALF?$CLOCK\s*(?:이후\s*)?상차?(?!하)""" +
            """|(?<![가-힣])(?:당상|내상)""")
    private val DROPOFF = Regex(
        """$DAY?$HALF?$CLOCK\s*(?:전|까지|이전)?\s*(?:하차|착)""" +
            """|(?<![가-힣])(?:당착|내착)""")

    fun split(memo: String?): Split {
        val m = memo.orEmpty()
        return Split(
            pickup = PICKUP.findAll(m).joinToString(" ") { it.value.trim() },
            dropoff = DROPOFF.findAll(m).joinToString(" ") { it.value.trim() },
        )
    }
}
