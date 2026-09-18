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
interface IDispatchAppPlugin {
    val code: String                  // "kakaopicker", "insung", "hwamul24"
    val label: String                 // "픽커", "인성콜", "24시"
    val packageKeywords: List<String>    // ["flexer"], ["insung"], ["logione", "carrier"]
    val keywords: ScreenKeywords      // 배차망별 화면 키워드 사전
    val networkMarkers: List<List<String>> // 배차망 고유 화면 식별 마커 목록
    val parser: IScrapParser          // 리스트/상세 텍스트 파서

    /** 잡기 수순(자동 클릭 및 계약 체결)을 지원하는 배차망인가 */
    val supportsCatching: Boolean

    /** 스냅샷 OCR 검증기 (null이면 기존 텍스트 기반 파싱 유지) */
    val ocrParser: ScreenOcrParser<*>?

    /** 안전취소 가능 시간 (ms) — 안전취소가 없는 배차망(픽커 등)은 null */
    fun getSafeCancelMs(filter: FilterConfig): Long?

    /** 상세 화면 머묾 타이머 시간 (ms) — 서버 DB 값이 원천이므로 각 배차망이 FilterConfig에서 조회 */
    fun getDetailBackTimeoutMs(filter: FilterConfig): Long

    /** 화면 문맥 판별 (배차망별 특수 해석이 필요할 때 오버라이드) */
    fun resolveScreenContext(text: String, defaultContext: com.onedal.app.models.ScreenContext): com.onedal.app.models.ScreenContext = defaultContext

    /** 패키지명이 해당 배차망에 속하는지 검사 */
    fun isTargetPackage(pkg: String): Boolean = packageKeywords.any { pkg.contains(it, ignoreCase = true) }

    /** 상세 진입 시 배차망 고유 특수 실행 (인성의 3단계 팝업 수집 등). 처리 완료 시 true 반환 */
    fun executePreConfirmSpecial(
        context: ScanContext,
        rootNode: android.view.accessibility.AccessibilityNodeInfo,
        screenTexts: List<String>,
        order: SimplifiedOfficeOrder
    ): Boolean = false
}
