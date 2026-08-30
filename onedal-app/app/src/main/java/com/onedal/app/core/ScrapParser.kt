package com.onedal.app.core

import android.content.Context
import com.onedal.app.models.FilterTally
import com.onedal.app.models.SimplifiedOfficeOrder
import com.onedal.app.plugins.hwamul24.Hwamul24Parser
import com.onedal.app.plugins.insung.InsungParser
import com.onedal.app.plugins.kakaopicker.KakaoPickerParser

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
        "픽커" -> KakaoPickerParser(context)   // 수집 전용 — 잡기 수순 없음 (픽커_수집.md)
        "인성콜" -> InsungParser(context)
        else -> InsungParser(context) // 기본값
    }

    /** 현재 어떤 파서를 쓰고 있는지 확인 */
    fun currentParserName(): String = delegate::class.simpleName ?: "Unknown"

    override fun parse(texts: List<String>): SimplifiedOfficeOrder = delegate.parse(texts)
    override fun shouldClick(order: SimplifiedOfficeOrder, tally: FilterTally?): Boolean = delegate.shouldClick(order, tally)
    override fun parsePickupDistance(rawText: String): Double? {
        return delegate.parsePickupDistance(rawText)
    }

    override fun groupListNodes(allNodes: List<ScreenTextNode>): List<Pair<ScreenTextNode, List<String>>> {
        return delegate.groupListNodes(allNodes)
    }

    // 🔴 #84 — 이 줄이 빠진 채 인터페이스 기본값 0 이 답해서, 픽커 테두리가 카드 반 토막이었다.
    //    지금은 기본값을 없애 컴파일러가 누락을 잡는다 (IScrapParser 주석 참조)
    override fun alarmBandHalfPx(): Int = delegate.alarmBandHalfPx()
}
