package com.onedal.app.plugins.isflex

import com.onedal.app.core.IScrapParser
import com.onedal.app.core.ScreenTextNode
import com.onedal.app.core.engine.OrderRequirement
import com.onedal.app.models.FilterTally
import com.onedal.app.models.SimplifiedOfficeOrder

/**
 * 📄 **인성플렉스 파서 — 빈 껍데기**. 아무 콜도 읽지 않고 누르지 않는다.
 * 목록 줄은 0 개 · 판정은 늘 «안 누름» · 손으로 연 상세도 상차 · 하차가 비어 요건 검사(`OrderRequirement`)가 버린다.
 */
class IsflexParser : IScrapParser {

    override fun parse(texts: List<String>): SimplifiedOfficeOrder =
        SimplifiedOfficeOrder(id = "FLX-EMPTY", pickup = OrderRequirement.MISSING, dropoff = OrderRequirement.MISSING, timestamp = "")

    override fun shouldClick(order: SimplifiedOfficeOrder, tally: FilterTally?): Boolean = false

    /** 판정을 안 싣는다 — 이 파서는 아직 판정하지 않는다 */
    override fun withVerdict(order: SimplifiedOfficeOrder, tally: FilterTally?): SimplifiedOfficeOrder = order

    override fun reservationMode(): String? = null

    override fun matchDetailOrder(screenTexts: List<String>, recentOrders: List<SimplifiedOfficeOrder>): SimplifiedOfficeOrder? = null

    override fun groupListNodes(allNodes: List<ScreenTextNode>): List<Pair<ScreenTextNode, List<String>>> = emptyList()

    override val lastFrameDiscarded: Boolean = false
}
