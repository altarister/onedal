package com.onedal.app.core

import android.content.Context
import com.onedal.app.models.FilterTally
import com.onedal.app.models.SimplifiedOfficeOrder

/**
 * 파서 위임자(Delegator) 및 라우터.
 *
 * 타겟 앱 이름("인성콜", "24시" 등)에 따라 적절한 파서 플러그인으로 처리를 위임합니다.
 */
class ScrapParser(private val context: Context, targetApp: String) : IScrapParser {

    companion object {
        private const val TAG = "1DAL_PARSER"
    }

    private val delegate: IScrapParser =
        com.onedal.app.plugins.DispatchPluginRegistry.findByLabel(targetApp).parser

    /** 현재 어떤 파서를 쓰고 있는지 확인 */
    fun currentParserName(): String = delegate::class.simpleName ?: "Unknown"

    override fun parse(texts: List<String>): SimplifiedOfficeOrder = delegate.parse(texts)
    override fun shouldClick(order: SimplifiedOfficeOrder, tally: FilterTally?): Boolean = delegate.shouldClick(order, tally)
    override fun parsePickupDistance(rawText: String): Double? {
        return delegate.parsePickupDistance(rawText)
    }

    override fun matchDetailOrder(screenTexts: List<String>, recentOrders: List<SimplifiedOfficeOrder>): SimplifiedOfficeOrder? =
        delegate.matchDetailOrder(screenTexts, recentOrders)

    override fun groupListNodes(allNodes: List<ScreenTextNode>): List<Pair<ScreenTextNode, List<String>>> {
        return delegate.groupListNodes(allNodes)
    }

    // 🔴 위임을 빠뜨리면 컴파일이 안 된다 — 인터페이스에 기본값이 없다 (#84 · IScrapParser 주석 참조)
    override fun alarmBandHalfPx(): Int = delegate.alarmBandHalfPx()

    /**
     * 🗳️ **판정 위임** — 인터페이스에 기본값이 없어, 위임을 잊으면 컴파일이 안 된다
     * (기본값이 있으면 `verdict` 가 조용히 `null` 로 나간다).
     */
    override fun withVerdict(order: SimplifiedOfficeOrder, tally: FilterTally?): SimplifiedOfficeOrder =
        delegate.withVerdict(order, tally)
}
