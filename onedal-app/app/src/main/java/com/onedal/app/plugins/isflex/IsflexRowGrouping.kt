package com.onedal.app.plugins.isflex

/**
 * 🖼️ **인성플렉스 목록 줄 묶기 — 글자와 자리만 받는 순수 함수** (`IsflexParserTest` · 실물 02 · 07 좌표).
 * 접근성 노드(`ScreenTextNode`)는 폰 없이 못 만들어 자리만 받는다 — 파서가 노드를 이 꼴로 옮겨 부른다.
 *
 * 묶는 셈은 요금 노드가 줄의 기준이고 다른 노드는 가장 가까운 기준 요금 하나에 붙는다(픽커 목록과 같은 꼴).
 * 화물24시처럼 «요금이 줄의 끝»으로 못 묶는다 — 요금이 줄 **가운데 높이**에 있다(출발지 위 · 요금 · 운행 거리 아래).
 * 🔴 칸 머리 «수입»이 없으면 줄 0 — 목록인지 모르는 판(시트 · 상세 · 진행중 · 지도)에서 콜을 지어내지 않는다.
 * 🔴 칩(«오토바이» · «승용/소형»)은 낱말이 아니라 **자리로**(칸 머리 위) 뺀다 — 같은 글자가 줄 차종이기도 하다.
 */
object IsflexRowGrouping {

    /** 화면 글자 한 칸 — 자리는 화면 픽셀 */
    data class Cell(val text: String, val left: Int, val top: Int, val right: Int, val bottom: Int) {
        val centerX: Int get() = (left + right) / 2
        val centerY: Int get() = (top + bottom) / 2
    }

    /**
     * 묶은 줄 하나 — 자리 번호는 넘겨받은 `cells` 의 번호다.
     * @property fareIndex 기준 요금(누름 · 진단 · 다시 잼의 대표)
     * @property members 줄 글자 — (왼끝, 위끝) 차례 · 거리 · 차종 · 출발지 · 운행 거리 · 도착지 · 수입 · 결제
     * @property extras 같은 꼴이 둘 이상이라 뺀 글자(잘린 이웃 줄 조각) — 모은 글자 «남는 토막»으로 간다
     */
    data class Row(val fareIndex: Int, val members: List<Int>, val extras: List<Int>)

    /** 칸 머리 «수입» — 이 글자 그대로인 노드(«총 수입»은 아니다) */
    const val HEADER_FARE = "수입"

    val FARE = Regex("""^\d{1,3}(,\d{3})+$""")
    val PICKUP_DISTANCE = Regex("""^\d+(\.\d+)?$""")
    val DELIVERY_DISTANCE = Regex("""^약\s*(\d+(\.\d+)?)\s*km$""")
    val PAYMENTS = setOf("선불", "착불")
    const val PICKUP_MARK = "@"

    /** 한 줄에 하나만 있어야 하는 꼴 — 둘이면 요금에 가까운 것만 남긴다 */
    private fun shapeOf(text: String): String? = when {
        text.startsWith(PICKUP_MARK) -> "pickup"
        PICKUP_DISTANCE.matches(text) -> "pickupDistance"
        DELIVERY_DISTANCE.matches(text) -> "deliveryDistance"
        text in PAYMENTS -> "payment"
        else -> null
    }

    /** 칸 머리 줄 — (머리 아래끝, 요금 칸 왼끝) · «수입»이 없으면 null */
    fun headerOf(cells: List<Cell>): Pair<Int, Int>? {
        val fareHead = cells.firstOrNull { it.text.trim() == HEADER_FARE } ?: return null
        // 같은 줄 = 세로로 겹친다(«출발지까지\n(km)»는 두 줄 높이라 위아래로 더 길다)
        val bottom = cells.filter { it.top < fareHead.bottom && it.bottom > fareHead.top }.maxOf { it.bottom }
        return bottom to fareHead.left
    }

    fun rows(cells: List<Cell>): List<Row> {
        val (headerBottom, fareLeft) = headerOf(cells) ?: return emptyList()
        val body = cells.indices.filter { cells[it].centerY > headerBottom }
        val anchors = body.filter { FARE.matches(cells[it].text.trim()) && cells[it].centerX >= fareLeft }
            .sortedBy { cells[it].centerY }
        if (anchors.isEmpty()) return emptyList()
        val centers = anchors.map { cells[it].centerY }
        val byRow = anchors.associateWith { mutableListOf(it) }
        for (i in body) {
            if (i in byRow) continue
            val a = nearestAnchor(centers, cells[i].centerY, headerBottom) ?: continue
            byRow.getValue(anchors[a]).add(i)
        }
        return anchors.map { anchor ->
            val fareY = cells[anchor].centerY
            val members = byRow.getValue(anchor)
            val extras = members.filter { it != anchor }
                .groupBy { shapeOf(cells[it].text.trim()) }
                .filterKeys { it != null }
                .values.flatMap { same -> same.sortedBy { kotlin.math.abs(cells[it].centerY - fareY) }.drop(1) }
            Row(anchor, (members - extras.toSet()).sortedWith(compareBy({ cells[it].left }, { cells[it].top })), extras)
        }
    }

    /**
     * 가장 가까운 기준 요금의 번호 — 한도 = 이웃 기준 요금까지 간격의 절반 가운데 작은 것.
     * 기준 요금이 하나면 한도 = 그 요금 가운데 − 칸 머리 아래끝. 한도 밖이면 어디에도 안 붙는다(null).
     */
    private fun nearestAnchor(centers: List<Int>, y: Int, headerBottom: Int): Int? {
        val best = centers.indices.minByOrNull { kotlin.math.abs(centers[it] - y) } ?: return null
        val limit = centers.indices.filter { it != best }.minOfOrNull { kotlin.math.abs(centers[it] - centers[best]) / 2 }
            ?: (centers[best] - headerBottom)
        return if (kotlin.math.abs(centers[best] - y) <= limit) best else null
    }
}
