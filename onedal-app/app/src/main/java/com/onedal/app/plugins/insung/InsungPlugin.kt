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
    override val networkMarkers: List<List<String>> get() = InsungPages.networkMarkers
    override val parser: IScrapParser by lazy {
        InsungParser(context ?: throw IllegalStateException("InsungParser requires non-null Context"))
    }

    override val availableModes: Set<String> = TargetApp.ALL_MODES

    /** 📄 페이지 정의 — `InsungPages` (reviews/24) */
    override val pages get() = InsungPages.pages
    override val screens get() = InsungPages.screens

    /** ✋ 출발지 · 도착지 팝업이 닫히는 애니메이션 동안 글자가 남는다 */
    override fun isPopupResidue(rawScreenStr: String): Boolean =
        rawScreenStr.contains("출발지 상세") || rawScreenStr.contains("도착지 상세")

    override fun onConfirmedDetail(scan: com.onedal.app.core.engine.ScanContext, rootNode: android.view.accessibility.AccessibilityNodeInfo, screenTexts: List<String>, rawScreenStr: String) =
        scan.handleConfirmedScreen(rootNode, screenTexts, rawScreenStr)

    override fun onPopup(scan: com.onedal.app.core.engine.ScanContext, context: com.onedal.app.models.ScreenContext, rootNode: android.view.accessibility.AccessibilityNodeInfo, screenTexts: List<String>) = when (context) {
        com.onedal.app.models.ScreenContext.POPUP_MEMO -> scan.handleMemoPopup(rootNode, screenTexts)
        com.onedal.app.models.ScreenContext.POPUP_PICKUP -> scan.handlePickupPopup(rootNode, screenTexts)
        com.onedal.app.models.ScreenContext.POPUP_DROPOFF -> scan.handleDropoffPopup(rootNode, screenTexts)
        else -> Unit
    }

    override val logTag: String get() = "1DAL_INSUNG"

    /**
     * ✍️ **확정 버튼 글자 — «확정» 하나** (기사님 «가»). 실물 확정 전 상세 바닥 버튼은 늘 «확정(N)»이다(캡처 3장).
     * 🔴 둘째 글자를 두지 않는다 — «확정»이 안 보이는 순간 «배차…»로 시작하는 엉뚱한 칸(적요 줄 등)을 누를 수 있었다. 못 찾으면 «버튼 못 찾음» 길(누르지 않고 빠져나옴).
     */
    override val acceptButtons: List<String>? = listOf("확정")

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

    /** 🏠 팝업 «위치»를 상차·하차 칸에 — 못 꺼낸 쪽은 목록 짧은 이름 그대로(그러면 상세 요건에서 탈락한다) */
    override fun fillDetail(context: ScanContext, order: SimplifiedOfficeOrder): SimplifiedOfficeOrder {
        val collected = context.session.accumulatedDetailText
        return order.copy(
            pickup = InsungPopupAddress.of(collected, InsungPopupAddress.PICKUP_TAG) ?: order.pickup,
            dropoff = InsungPopupAddress.of(collected, InsungPopupAddress.DROPOFF_TAG) ?: order.dropoff,
        )
    }
}
