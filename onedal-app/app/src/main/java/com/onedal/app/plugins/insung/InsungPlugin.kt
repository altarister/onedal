package com.onedal.app.plugins.insung

import android.content.Context
import android.view.accessibility.AccessibilityNodeInfo
import com.onedal.app.core.IScrapParser
import com.onedal.app.core.ScreenKeywords
import com.onedal.app.core.ScreenOcrParser
import com.onedal.app.core.TargetApp
import com.onedal.app.core.engine.ScanContext
import com.onedal.app.models.FilterConfig
import com.onedal.app.models.SimplifiedOfficeOrder
import com.onedal.app.plugins.IDispatchAppPlugin

/**
 * 📦 **인성데이타 플러그인 구현체**
 *
 * 인성 배차망의 고유 동작을 캡슐화한다:
 * - 자동 모드에서 앱이 확정을 누른다 (`acceptButtons` = 확정 버튼 글자)
 * - OCR 대신 접근성 텍스트 트리 직접 수집 (`ocrParser = null`)
 * - 안전취소 시간: `filter.safeCancelSecInsung * 1000L`
 * - 상세 진입 시 인성 고유 특수 실행: 팝업 3장 수집 및 동명이동 검증 (`handleInsungPreConfirmExecution`)
 */
class InsungPlugin(private val context: Context? = null) : IDispatchAppPlugin {

    override val code: String = TargetApp.INSUNG
    override val label: String = "인성콜"
    override val packageKeywords: List<String> = listOf("insung")
    override val keywords: ScreenKeywords = InsungKeywords.INSUNG
    override val networkMarkers: List<List<String>> = InsungKeywords.NETWORK_MARKERS
    override val parser: IScrapParser by lazy {
        InsungParser(context ?: throw IllegalStateException("InsungParser requires non-null Context"))
    }

    override val availableModes: Set<String> = TargetApp.ALL_MODES

    override val acceptButtons: List<String>?
        get() = keywords.confirmKeywords

    override val ocrParser: ScreenOcrParser<*>? = null

    override fun getSafeCancelMs(filter: FilterConfig): Long =
        filter.safeCancelSecInsung * 1000L

    override fun executePreConfirmSpecial(
        context: ScanContext,
        rootNode: AccessibilityNodeInfo,
        screenTexts: List<String>,
        order: SimplifiedOfficeOrder
    ): Boolean {
        return context.handleInsungPreConfirmExecution(rootNode, screenTexts)
    }

    /** 🏘️ 주의 동네 판정기 — 인성 플러그인이 들고 있다 (공통 코드는 이 판정기를 모른다) */
    private val cautionVerifier by lazy {
        CautionDongVerifier(context ?: throw IllegalStateException("CautionDongVerifier requires non-null Context"))
    }

    override fun passesDetailFilter(context: ScanContext, order: SimplifiedOfficeOrder): Boolean =
        context.passesCautionDong(order, cautionVerifier)
}
