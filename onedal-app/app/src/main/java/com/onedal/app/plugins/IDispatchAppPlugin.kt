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

    /**
     * ✍️ **수락 칸 — 앱이 누를 계약 버튼 글자** (배차망_모드표.md 순서 ⑦). `null` 이면 앱이 누를 계약 버튼이 없다.
     * 화면 판별 글자(`keywords.confirmKeywords`)와 따로 둔다 — 같은 글자를 판별에도 누르기에도 쓰면,
     * 판별용 낱말이 곧 누를 버튼이 된다(픽커는 판별 낱말이 «수락하기»다).
     * 🔴 비었는지 읽는 곳은 상세 처리의 확정 자리 한 곳뿐이다.
     */
    val acceptButtons: List<String>?

    /**
     * 📄 **페이지 정의 — 목록 · 상세 · 확정 · 내 오더의 칸이 화면 어디에 어떤 글자로 오나** (reviews/24).
     * 기본 구현을 두지 않는다 — 배차망마다 제 손으로 적는다. 칸 이름은 공통(`PageField`).
     */
    val pages: com.onedal.app.core.PageSpecs

    /**
     * 📜 **목록 머리줄이 화면에 보이나** — 목록이 내려가면 앱은 오더카드와 목록 줄을 못 가른다(픽커 «리스트 설정»).
     * 화면 종류 이름을 늘리지 않고 이 사실 하나를 보고·로그에 싣는다. 모르는 배차망은 null(모름) — 인성·24시.
     */
    fun listHeaderVisible(allNodes: List<com.onedal.app.core.ScreenTextNode>): Boolean? = null

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
     * 📋 **이 콜 종류는 하차가 없어도 요건을 갖춘 것인가** — 요건 한 줄(`OrderRequirement`)에서 배차망마다 다른 단 하나.
     * 기본은 «아니다». 픽커: 도보(와 종류를 모르는 줄)는 원래 하차지가 없다.
     */
    fun allowsEmptyDropoff(order: SimplifiedOfficeOrder): Boolean = false

    /**
     * 🔎 **2차 필터에 더하는 배차망 규칙** — 공통 `shouldClick` 과 함께 본다. 기본은 «통과».
     * 인성: 주의 동네(같은 이름 다른 동)면 채운 글자에 시·군이 있어야 통과.
     */
    fun passesDetailFilter(context: ScanContext, order: SimplifiedOfficeOrder): Boolean = true

    /**
     * 🏠 **채운 값을 콜에 싣는다** — 채우기(`executePreConfirmSpecial`)가 끝난 뒤 한 번. 기본은 그대로.
     * 인성은 팝업 «위치»에서 전체 주소를 꺼내 상차·하차 칸에 넣는다(서버가 꺼내지 않는다 — 기사님 «상세 데이터엔 전체 주소»).
     */
    fun fillDetail(context: ScanContext, order: SimplifiedOfficeOrder): SimplifiedOfficeOrder = order

    /**
     * 👆 **목록에서 이 콜을 눌러도 되나, 어디를 누르나** — 누르기 전 안전 확인 (배차망_모드표.md «누를 수 있는 카드의 조건»).
     * 기본: 요금 칸을 바로 누른다. 픽커: 계약 버튼이 한 번에 눌릴 수 있는 카드(오더카드)를 피한다.
     */
    fun planListTap(
        allNodes: List<com.onedal.app.core.ScreenTextNode>,
        order: SimplifiedOfficeOrder,
        fareNode: com.onedal.app.core.ScreenTextNode,
    ): ListTap? = ListTap(rowLeft = false, delayMs = 0L)

    /**
     * 🔄 **화면이 바뀔 때 배차망이 할 일** — 기본은 없음. 픽커: 기사님이 «수락하기»를 누르셨는지 알아본다.
     * 🔴 화면 이름을 서버에 보내기(`updateScreenContext`) **전에** 불린다 — 뒤집히면 서버가 수락 전에 미리보기를 치운다.
     */
    fun onScreenChanged(
        context: ScanContext,
        previous: com.onedal.app.models.ScreenContext,
        detected: com.onedal.app.models.ScreenContext,
        screenTexts: List<String>,
        rawScreenStr: String,
        packageName: String?,
    ) {}

    /** 상세 진입 시 배차망 고유 특수 실행 (인성의 팝업 3장 채우기 등). 채우는 중이면 true 반환 */
    fun executePreConfirmSpecial(
        context: ScanContext,
        rootNode: android.view.accessibility.AccessibilityNodeInfo,
        screenTexts: List<String>,
        order: SimplifiedOfficeOrder
    ): Boolean = false
}
