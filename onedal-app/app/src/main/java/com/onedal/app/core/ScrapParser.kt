package com.onedal.app.core

import android.content.Context
import com.onedal.app.models.SimplifiedOfficeOrder
import com.onedal.app.plugins.hwamul24.Hwamul24Parser
import com.onedal.app.plugins.insung.InsungParser

/**
 * 파서 위임자(Delegator) 및 라우터.
 *
 * 타겟 앱 이름("인성콜", "24시" 등)에 따라 적절한 파서 플러그인으로 처리를 위임합니다.
 */
class ScrapParser(private val context: Context, targetApp: String) : IScrapParser {

    companion object {
        private const val TAG = "1DAL_PARSER"
    }

    private val delegate: IScrapParser = when (targetApp) {
        "24시" -> Hwamul24Parser(context)
        "인성콜" -> InsungParser(context)
        else -> InsungParser(context) // 기본값
    }

    /** 현재 어떤 파서를 쓰고 있는지 확인 */
    fun currentParserName(): String = delegate::class.simpleName ?: "Unknown"

    override fun parse(texts: List<String>): SimplifiedOfficeOrder = delegate.parse(texts)
    override fun shouldClick(order: SimplifiedOfficeOrder): Boolean = delegate.shouldClick(order)
    override fun parsePickupDistance(rawText: String): Double? {
        return delegate.parsePickupDistance(rawText)
    }

    override fun groupListNodes(allNodes: List<ScreenTextNode>): List<Pair<ScreenTextNode, List<String>>> {
        return delegate.groupListNodes(allNodes)
    }
}
