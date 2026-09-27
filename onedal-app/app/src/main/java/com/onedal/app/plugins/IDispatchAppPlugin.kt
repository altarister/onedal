package com.onedal.app.plugins

import com.onedal.app.core.IScrapParser
import com.onedal.app.core.ScreenKeywords
import com.onedal.app.core.ScreenOcrParser
import com.onedal.app.core.engine.ScanContext
import com.onedal.app.models.FilterConfig
import com.onedal.app.models.SimplifiedOfficeOrder

/**
 * 🧩 **모든 배차망이 구현해야 하는 통합 플러그인 규격**
 *
 * 배차망별 고유 로직(키워드, 파서, 대기시간, 스냅샷 OCR 유무, 특수 실행 수순)을
 * 플러그인 내부로 캡슐화하여 코어 엔진의 if문을 소멸시킨다.
 */
/**
 * 👆 **목록에서 콜을 누를 자리** — `planListTap` 의 답. `null` 이면 누르지 않는다.
 * @param rowLeft 요금 칸이 아니라 그 줄의 왼쪽 끝을 누른다 (`TapShift`)
 * @param delayMs 자국을 보여 준 뒤 누르기까지 기다리는 시간
 */
data class ListTap(val rowLeft: Boolean, val delayMs: Long)

interface IDispatchAppPlugin {
    val code: String                  // "kakaopicker", "insung", "hwamul24"
    val label: String                 // "픽커", "인성콜", "24시"
    val packageKeywords: List<String>    // ["flexer"], ["insung"], ["logione", "carrier"]
    val keywords: ScreenKeywords      // 배차망별 화면 키워드 사전
    val networkMarkers: List<List<String>> // 배차망 고유 화면 식별 마커 목록
    val parser: IScrapParser          // 리스트/상세 텍스트 파서

    /**
     * 🎛️ **이 배차망에서 쓸 수 있는 모드** (기사님 확정 · 배차망_모드표.md).
     * 한 벌(`TargetApp.ALL_MODES`)에서 파생한다 — 모드 이름을 플러그인마다 따로 적지 않는다.
     */
    val availableModes: Set<String>

    /** 잡기 수순(자동 클릭 및 계약 체결)을 지원하는 배차망인가 */
    val supportsCatching: Boolean

    /** 스냅샷 OCR 검증기 (null이면 기존 텍스트 기반 파싱 유지) */
    val ocrParser: ScreenOcrParser<*>?

    /** 안전취소 가능 시간 (ms) — 안전취소가 없는 배차망(픽커 등)은 null */
    fun getSafeCancelMs(filter: FilterConfig): Long?

    /** 상세 화면 머묾 타이머 시간 (ms) — 상세 자동 복귀가 있는 배차망(픽커)만 반환, 인성·24시는 null */
    fun getDetailBackTimeoutMs(filter: FilterConfig): Long? = null

    /** 화면 문맥 판별 (배차망별 특수 해석이 필요할 때 오버라이드) */
    fun resolveScreenContext(text: String, defaultContext: com.onedal.app.models.ScreenContext): com.onedal.app.models.ScreenContext = defaultContext

    /** 패키지명이 해당 배차망에 속하는지 검사 */
    fun isTargetPackage(pkg: String): Boolean = packageKeywords.any { pkg.contains(it, ignoreCase = true) }

    /**
     * 🔎 **2차 필터에 더하는 배차망 규칙** — 공통 `shouldClick` 과 함께 본다. 기본은 «통과».
     * 인성: 주의 동네(같은 이름 다른 동)면 채운 글자에 시·군이 있어야 통과.
     */
    fun passesDetailFilter(context: ScanContext, order: SimplifiedOfficeOrder): Boolean = true

    /**
     * 👆 **목록에서 이 콜을 눌러도 되나, 어디를 누르나** — 누르기 전 안전 확인 (배차망_모드표.md «누를 수 있는 카드의 조건»).
     * 기본: 요금 칸을 바로 누른다. 픽커: 계약 버튼이 한 번에 눌릴 수 있는 카드(오더카드)를 피한다.
     */
    fun planListTap(
        allNodes: List<com.onedal.app.core.ScreenTextNode>,
        order: SimplifiedOfficeOrder,
        fareNode: com.onedal.app.core.ScreenTextNode,
    ): ListTap? = ListTap(rowLeft = false, delayMs = 0L)

    /** 상세 진입 시 배차망 고유 특수 실행 (인성의 팝업 3장 채우기 등). 채우는 중이면 true 반환 */
    fun executePreConfirmSpecial(
        context: ScanContext,
        rootNode: android.view.accessibility.AccessibilityNodeInfo,
        screenTexts: List<String>,
        order: SimplifiedOfficeOrder
    ): Boolean = false
}
