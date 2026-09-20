package com.onedal.app.plugins.hwamul24

/**
 * 🧩 **화물24시 화면 글자를 읽는 규칙 — 순수 부분**
 *
 * «어디까지가 콜 한 장인가»(카드 경계)와 그 안의 **요금·거리**를 읽는다.
 * 요금 글자가 카드의 **끝**에 오므로, 요금 자리를 찾으면 그 앞부터 거기까지가 한 장이다.
 *
 * 🔴 **셋이 한 파일에 있는 것은 같은 함정을 공유하기 때문이다** — 화물24시 화면은 숫자와
 *    단위를 **따로** 그린다(«200,000»+«원» · «14»+«Km»). 규칙이 흩어지면 한쪽만 고쳐져
 *    «카드는 묶었는데 요금이 0» 같은 반쪽 상태가 된다.
 *
 * 🔴 **왜 따로 떼었나** — `groupListNodes` 는 `ScreenTextNode` 를 받는데 그 안에
 *    `AccessibilityNodeInfo` 가 들어 있어 **폰 없이는 만들 수 없다.** 그래서 카드를
 *    한 장도 못 읽던 시절에도 검사를 쓸 수가 없었다. 판정에 필요한 것은 «글자와 자리»뿐이라
 *    그것만 받는 함수로 떼어 두면 문제지를 손으로 먹일 수 있다
 *    (인성 필터를 `InsungParser.decide` 로 쪼갠 것과 같은 까닭 · 버그 대장 #29~35).
 */
object Hwamul24CardGrouping {

    /** 화면 글자 한 조각 — 판정에 필요한 것만 */
    data class Cell(val text: String, val top: Int, val left: Int)

    /** 한 조각으로 온 요금 — `70,000원` */
    private val FARE_WHOLE = Regex("""^\d{1,3}(,\d{3})*원$""")

    /** 숫자만 온 조각 — `70,000`. 바로 뒤에 «원»이 따라오면 요금이다 */
    private val FARE_NUMBER = Regex("""^\d{1,3}(,\d{3})*$""")

    /** 뒤따르는 «원» 조각. 앞뒤 공백은 화면마다 다르다 */
    private val WON_ONLY = Regex("""^\s*원\s*$""")

    /**
     * 🔴 **요금으로 읽으면 안 되는 줄** — 화면 머리의 «잔액 : 544,864 원».
     *    그 줄도 숫자와 «원»이 따로 온다(시뮬레이터 `잔액 : <span>{n}</span>원`).
     *    낱말이 **같은 줄**에 있는지로 가른다 — 높이를 하드코딩하지 않는다.
     */
    private val NOT_FARE_WORDS = listOf("잔액", "충전", "포인트", "예치금")

    /** 같은 줄로 볼 세로 오차(px) — 글자 크기가 달라도 한 줄이면 이 안에 든다 */
    private const val SAME_LINE_PX = 24

    /**
     * 카드 한 장이 어디서 끝나는가.
     *
     * @property fareIndex 요금 **숫자**가 있는 자리 — 카드의 대표다(진단 로그·위치 기억이 읽는다)
     * @property endIndex  카드의 마지막 조각 — 두 조각이면 «원»까지다
     */
    data class Card(val fareIndex: Int, val endIndex: Int)

    /**
     * 요금 자리를 찾아 카드의 경계를 돌려준다 — 화면 위에서 아래 순서로.
     *
     * @param cells **화면 순서로 정렬된** 글자들 (위에서 아래, 같은 줄이면 왼쪽부터)
     */
    fun cards(cells: List<Cell>): List<Card> {
        val out = mutableListOf<Card>()
        for ((i, c) in cells.withIndex()) {
            val whole = FARE_WHOLE.matches(c.text)
            // 두 조각 — 숫자 뒤에 «원» 하나가 따라온다
            val split = !whole && FARE_NUMBER.matches(c.text) &&
                cells.getOrNull(i + 1)?.let { WON_ONLY.matches(it.text) } == true
            if (!whole && !split) continue
            if (isOnExcludedLine(c, cells)) continue
            out.add(Card(fareIndex = i, endIndex = if (whole) i else i + 1))
        }
        return out
    }

    /**
     * 글자 목록의 `i` 번째부터 요금을 읽는다 — **한 조각이든 두 조각이든**.
     *
     * 🔴 카드 묶기와 **같은 규칙**을 쓰라고 공개한다 (규칙 ③). 파서가 따로 정규식을 적으면
     *    «카드는 묶었는데 요금이 0» 이 되어 콜이 통째로 버려진다.
     *
     * @return 원 단위 금액. 그 자리가 요금이 아니면 `null`
     */
    fun fareAt(texts: List<String>, i: Int): Int? {
        val t = texts.getOrNull(i)?.trim() ?: return null
        FARE_WHOLE.find(t)?.let { return it.value.dropLast(1).replace(",", "").toIntOrNull() }
        if (FARE_NUMBER.matches(t) && WON_ONLY.matches(texts.getOrNull(i + 1)?.trim() ?: "")) {
            return t.replace(",", "").toIntOrNull()
        }
        return null
    }

    /** 한 조각으로 온 거리 — `11Km` */
    private val DIST_WHOLE = Regex("""(\d+)Km""", RegexOption.IGNORE_CASE)

    /** 숫자만 온 조각 — `14`. 바로 뒤에 «Km»가 따라오면 거리다 */
    private val DIST_NUMBER = Regex("""^\d+$""")
    private val KM_ONLY = Regex("""^\s*km\s*$""", RegexOption.IGNORE_CASE)

    /**
     * 상차까지 거리(km) — **한 조각이든 두 조각이든**. 카드에서 처음 만나는 것을 쓴다.
     *
     * 🔴 못 읽으면 `null` 이다 — 0 으로 지어내면 «상차지가 코앞»으로 읽혀
     *    경로 밖 콜이 통과한다 (규칙 ④).
     */
    fun pickupDistanceOf(texts: List<String>): Double? {
        for ((i, raw) in texts.withIndex()) {
            val t = raw.trim()
            DIST_WHOLE.find(t)?.let { return it.groupValues[1].toDoubleOrNull() }
            if (DIST_NUMBER.matches(t) && KM_ONLY.matches(texts.getOrNull(i + 1)?.trim() ?: "")) {
                return t.toDoubleOrNull()
            }
        }
        return null
    }

    /** 그 조각과 **같은 줄**에 «잔액» 같은 낱말이 있나 */
    private fun isOnExcludedLine(cell: Cell, cells: List<Cell>): Boolean =
        cells.any { other ->
            other !== cell &&
            kotlin.math.abs(other.top - cell.top) <= SAME_LINE_PX &&
            NOT_FARE_WORDS.any { other.text.contains(it) }
        }
}
