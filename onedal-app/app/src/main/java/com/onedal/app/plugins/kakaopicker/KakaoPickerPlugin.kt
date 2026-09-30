package com.onedal.app.plugins.kakaopicker

import com.onedal.app.core.engine.ScanContext
import com.onedal.app.core.LogTag
import android.content.Context
import com.onedal.app.core.IScrapParser
import com.onedal.app.core.ScreenKeywords
import com.onedal.app.core.ScreenOcrParser
import com.onedal.app.core.TargetApp
import com.onedal.app.models.FilterConfig
import com.onedal.app.plugins.IDispatchAppPlugin

/**
 * 📦 **카카오 T 픽커 플러그인 구현체**
 *
 * 카카오픽커 배차망의 고유 동작을 캡슐화한다:
 * - 자동 모드도 수락 칸도 없다 — 앱이 «수락하기»를 누르는 길이 없다 (`availableModes` · `acceptButtons = null`)
 * - 텍스트 트리에 배송지 주소가 없으므로 상단 스냅샷 OCR 파서(`PickerDetailOcrParser`) 탑재
 * - 수락 시 즉시 계약이 체결되므로 안전취소가 없음 (`getSafeCancelMs = null`)
 * - 상세 머묾 타이머: `filter.pickerAlarmDetailSec * 1000L`
 */
class KakaoPickerPlugin(private val context: Context? = null) : IDispatchAppPlugin {

    override val code: String = TargetApp.KAKAOPICKER
    override val label: String = "픽커"
    override val packageKeywords: List<String> = listOf("flexer")
    override val keywords: ScreenKeywords = KakaoPickerKeywords.PICKER
    override val networkMarkers: List<List<String>> = KakaoPickerKeywords.NETWORK_MARKERS
    override val parser: IScrapParser by lazy { KakaoPickerParser(context) }

    /** 🎛️ 픽커에는 자동 모드가 없다 — 수락이 곧 계약이고 되돌릴 수 없어 앱이 수락하기를 누르지 않는다 (기사님 확정) */
    override val availableModes: Set<String> = TargetApp.ALL_MODES - "AUTO"

    /**
     * ✍️ **픽커에는 앱이 누를 계약 버튼이 없다** (기사님 확정).
     * 수락이 곧 계약이고 되돌릴 창이 없다(전화만 · 하루 5번). 기사님 교정: *"«수락하기» 버튼만 클릭하지 못하는 것이고,
     * 나머지는 계약과 관련 없으므로 어떤 것도 클릭 가능하다."* — 그래서 앱은 목록 카드를 눌러 상세까지 들어가지만,
     * 계약 버튼은 누르지 않는다. 목록에서 오더카드를 피하는 것은 `planListTap`(«수락» 글자가 보이면 손대지 않는다)이다.
     */
    /** 📄 페이지 정의 — `KakaoPickerPages` (reviews/24) */
    override val pages get() = KakaoPickerPages.pages

    override val acceptButtons: List<String>? = null

    override val ocrParser: ScreenOcrParser<*> = PickerDetailOcrParser()

    override fun getSafeCancelMs(filter: FilterConfig): Long? = null

    override fun getDetailBackTimeoutMs(filter: FilterConfig): Long =
        filter.pickerAlarmDetailSec * 1000L

    override fun resolveScreenContext(
        text: String,
        defaultContext: com.onedal.app.models.ScreenContext
    ): com.onedal.app.models.ScreenContext =
        KakaoPickerKeywords.pickerScreenContextOf(text) ?: defaultContext

    /**
     * 👆 **픽커 목록에서 누르기 전 안전 확인** — 머리줄 위의 요금은 오더카드다, 누르면 그 자리에서 계약이다.
     *
     * `clickSafe` 는 요금 중심 **±60픽셀** 안의 글자만 보는데, 오더카드의 「수락」은 요금 **약 70픽셀 아래**라
     * 띠 밖이다. 그래서 **「리스트 설정」 머리줄보다 아래인가**를 함께 보고(`isListCardAnchor`),
     * 머리줄을 못 읽은 판은 손대지 않는다(규칙 ④). 누르기 바로 전에 요금 칸과 머리줄을 **다시 잰다**
     * (`stillListCardAtTap`). 요금 자리(오른쪽 아래)는 상세의 «수락하기»와 같은 자리라 **줄 왼쪽 끝**을
     * 자국을 보인 뒤 누른다(기다리는 시간은 `TapShift.PREVIEW_MS`). 안 누른 것도 까닭을 남긴다 — 로그의 침묵이 조사를 가장 늦춘다.
     * 같은 콜의 «보류» 로그는 한 번만 찍는다 — 못 누르는 콜은 매 스캔 다시 오기 때문이다.
     */
    /** 🛑 «상세 진입 보류»를 이미 남긴 콜의 지문 — 매 스캔 같은 줄로 로그를 덮지 않게 */
    private val heldLogged = mutableSetOf<Int>()

    private fun logHeldOnce(order: com.onedal.app.models.SimplifiedOfficeOrder, line: String) {
        if (heldLogged.size > 500) heldLogged.clear()
        if (heldLogged.add(com.onedal.app.core.CallMemory.fingerprintOf(order))) {
            com.onedal.app.core.AppLogger.w("1DAL_ALARM", line)
        }
    }

    /** 📜 픽커 목록 머리줄이 보이나 — «리스트 설정» */
    /** 🧹 픽커 상세 글은 «픽업지» 노드부터 — 목록 잔상을 뗀다 */
    override fun detailTextsOf(texts: List<String>): List<String> = KakaoPickerParser.detailTextsOf(texts)

    override fun listHeaderVisible(allNodes: List<com.onedal.app.core.ScreenTextNode>): Boolean {
        // 📏 아래 탭 줄 위끝 — 맨 아래 줄 누르기가 안 먹힌 자리(Y=2102 · 라이브 09-30 22:56 · 23:01)를 가를 재료. 바뀔 때만 한 줄
        allNodes.filter { it.text.trim() == "신규" || it.text.trim() == "내 오더" }.minOfOrNull { it.rect.top }?.let { y ->
            if (com.onedal.app.core.LogOnce.changed("tab-bar-top", "$y"))
                com.onedal.app.core.AppLogger.i("1DAL_PICKER", LogTag.SCREEN, "📏 [아래 탭 줄] 위끝 Y=$y (신규·내 오더)")
        }
        return KakaoPickerParser.listHeaderVisibleOf(allNodes.map { it.text })
    }

    override var lastHoldKey: String? = null
        private set

    override fun planListTap(
        allNodes: List<com.onedal.app.core.ScreenTextNode>,
        order: com.onedal.app.models.SimplifiedOfficeOrder,
        fareNode: com.onedal.app.core.ScreenTextNode,
    ): com.onedal.app.plugins.ListTap? {
        lastHoldKey = null
        val listHeaderY = KakaoPickerParser.listHeaderCenterY(allNodes.map { it.text to it.rect.centerY() })
        val onListCard = KakaoPickerParser.isListCardAnchor(fareNode.rect.centerY(), listHeaderY)
        if (listHeaderY == null) return planScrolledTap(allNodes, order, fareNode)
        val anchor = "닻(${fareNode.rect.centerX()},${fareNode.rect.centerY()}) 머리줄 Y=$listHeaderY"
        if (!onListCard || !KakaoPickerParser.clickSafe(order.rawText)) {
            val why = if (!onListCard) "머리줄 아래가 아니다 (오더카드이거나 머리줄을 못 읽었다)" else "카드에 「수락」이 보인다"
            logHeldOnce(order, "🛑 [상세 진입 보류] ${order.fare}원 $anchor — $why · 손대지 않는다")
            lastHoldKey = if (!onListCard) com.onedal.app.core.OpenBlocked.NOT_UNDER_HEADER else com.onedal.app.core.OpenBlocked.ACCEPT_VISIBLE
            return null
        }
        val headerNode = allNodes.firstOrNull { KakaoPickerParser.isListHeaderText(it.text) }?.node
        val refreshedY = { n: android.view.accessibility.AccessibilityNodeInfo? ->
            n?.takeIf { it.refresh() }?.let { val r = android.graphics.Rect(); it.getBoundsInScreen(r); r.centerY() }
        }
        val fareY = refreshedY(fareNode.node)
        val headerY = refreshedY(headerNode)
        if (!KakaoPickerParser.stillListCardAtTap(fareY, headerY)) {
            logHeldOnce(order, "🛑 [상세 진입 보류] ${order.fare}원 — 찍기 직전 다시 재니 머리줄 아래가 아니다 " +
                "(요금 Y=$fareY · 머리줄 Y=$headerY · 스캔 때 $anchor) · 손대지 않는다")
            lastHoldKey = com.onedal.app.core.OpenBlocked.TAP_RECHECK
            return null
        }
        // 🌊 흐르는 목록 — 스캔 때와 누르기 직전 요금 Y 가 다르면 안 누른다(누르면 «흐름 멈춤») · 곧 다시 읽는다
        if (fareY != null && com.onedal.app.core.TapShift.listMoving(fareNode.rect.centerY(), fareY, scrolledRecently = false)) {
            logHeldOnce(order, "🛑 [상세 진입 보류] ${order.fare}원 — 목록이 움직이는 중(스캔 Y=${fareNode.rect.centerY()} · 지금 Y=$fareY)")
            lastHoldKey = com.onedal.app.core.OpenBlocked.LIST_MOVING
            return null
        }
        // 👆 맨 아래 줄 — 탭 줄 위로 보이는 몫의 가운데를 누른다, 모자라면 보류 (`TapShift.rowTapDy` · 23:20~23:50 안 먹힘 12번)
        val tabWords = setOf("신규", "내 오더")
        val tabTop = allNodes.filter { it.text.trim() in tabWords }.minOfOrNull { it.rect.top }
        val fareCenter = fareY ?: fareNode.rect.centerY()
        val rowTop = allNodes.filter { it.text.trim() !in tabWords && it.rect.centerY() in (fareCenter - KakaoPickerParser.CARD_BAND_PX)..fareCenter }
            .minOfOrNull { it.rect.top } ?: fareNode.rect.top
        val dy = com.onedal.app.core.TapShift.rowTapDy(fareCenter, rowTop, tabTop) ?: run {
            logHeldOnce(order, "🛑 [상세 진입 보류] ${order.fare}원 — 탭 줄에 걸림(요금 Y=$fareCenter · 줄 위끝 $rowTop · 탭 위끝 $tabTop) · 목록이 올라오면 누른다")
            lastHoldKey = com.onedal.app.core.OpenBlocked.TAB_BAR
            return null
        }
        return com.onedal.app.plugins.ListTap(rowLeft = true, delayMs = com.onedal.app.core.TapShift.PREVIEW_MS, dy = dy)
    }

    /**
     * 👆 **내려간 목록(머리줄 없음)에서 누르기** (기사님 «목록이 내려가 있어도 앱을 열 수 있어야» · «가» · `PickerScrolledTapTest`).
     * 스캔 때 `scrolledRowTapBlock` 으로 보고, 누르기 직전에 요금 칸을 다시 재고 창 전체에서 «수락»·«숫자 P»를 다시 찾는다.
     * 누르는 자리는 줄 왼쪽 끝 그대로(`TapShift.rowLeftOf`) — 찰나에 오더카드가 덮어도 그 자리는 «X»(닫기) 쪽이다(실물 04).
     * 🔴 상세에서는 아무것도 누르지 않는 규칙은 그대로다 — 이 길은 목록 줄을 눌러 상세를 여는 데까지다.
     */
    private fun planScrolledTap(
        allNodes: List<com.onedal.app.core.ScreenTextNode>,
        order: com.onedal.app.models.SimplifiedOfficeOrder,
        fareNode: com.onedal.app.core.ScreenTextNode,
    ): com.onedal.app.plugins.ListTap? {
        val fareY = fareNode.rect.centerY()
        val B = com.onedal.app.core.OpenBlocked
        fun hold(why: String, key: String): com.onedal.app.plugins.ListTap? {
            logHeldOnce(order, "🛑 [상세 진입 보류] ${order.fare}원 닻(${fareNode.rect.centerX()},$fareY) 내려간 목록 — $why · 손대지 않는다")
            lastHoldKey = key
            return null
        }
        if (!SCROLLED_LIST_TAP) return hold("내려간 목록 누르기가 꺼져 있다", B.SCROLLED_OFF)
        if (!KakaoPickerParser.clickSafe(order.rawText)) return hold("카드에 「수락」이 보인다", B.ACCEPT_VISIBLE)
        val nodes = allNodes.map { Triple(it.text, it.rect.top, it.rect.bottom) }
        KakaoPickerParser.scrolledRowTapBlock(nodes, fareY)?.let { return hold(it.why, it.key) }
        // ⏱️ 누르기 직전 — 요금 칸을 다시 재고(스캔과 누름 사이 목록이 움직인다), 창 전체에서 오더카드 꼴을 다시 찾는다
        val node = fareNode.node ?: return hold("요금 칸 노드가 없다", B.TAP_RECHECK)
        if (!node.refresh()) return hold("찍기 직전 요금 칸을 다시 못 읽었다", B.TAP_RECHECK)
        val bounds = android.graphics.Rect().also { node.getBoundsInScreen(it) }
        // 🌊 흐르는 목록 — 라이브 10-01 00:31:13 716→849 · 00:31:20 1013→1932
        if (com.onedal.app.core.TapShift.listMoving(fareY, bounds.centerY(), scrolledRecently = false))
            return hold("목록이 움직이는 중(스캔 Y=$fareY · 지금 Y=${bounds.centerY()})", B.LIST_MOVING)
        KakaoPickerParser.scrolledRowTapBlock(nodes, bounds.centerY())?.let { return hold("찍기 직전 — ${it.why}", it.key) }
        var root: android.view.accessibility.AccessibilityNodeInfo = node
        val chain = mutableListOf<String>()
        for (i in 0 until 40) {
            val p = root.parent ?: break
            if (chain.size < 6) chain.add("${p.className?.toString()?.substringAfterLast('.') ?: "?"}${if (p.isScrollable) "↕" else ""}")
            root = p
        }
        root.findAccessibilityNodeInfosByText("수락").firstOrNull { it.isVisibleToUser }
            ?.let { return hold("찍기 직전 — 창에 «${it.text}»가 보인다", B.ACCEPT_VISIBLE) }
        root.findAccessibilityNodeInfosByText("P").firstOrNull { it.isVisibleToUser && KakaoPickerParser.isOfferPointButton(it.text?.toString().orEmpty()) }
            ?.let { return hold("찍기 직전 — 창에 오더카드 버튼 꼴 «${it.text}»가 보인다", B.ACCEPT_VISIBLE) }
        com.onedal.app.core.AppLogger.i("1DAL_ALARM", LogTag.TAP,
            "👆 [내려간 목록에서 누름] ${order.fare}원 · 띠 아래끝 Y=${KakaoPickerParser.waitingBandBottom(nodes)} · 요금 Y=${bounds.centerY()}(스캔 $fareY) · 조상 ${chain.joinToString(" < ")}")
        return com.onedal.app.plugins.ListTap(rowLeft = true, delayMs = com.onedal.app.core.TapShift.PREVIEW_MS)
    }

    companion object {
        /** 👆 내려간 목록에서 누르기 — 끄려면 이 한 줄을 false 로 (처음 다섯 번 중 하나라도 상세가 아닌 화면으로 가면 끈다 · 1f) */
        const val SCROLLED_LIST_TAP = true
    }

    /**
     * ✅ **기사님이 «수락하기»를 누르셨나** — 화면 분류가 아니라 **직접 확인**한다
     * (실사고 수리 · 기사님 지시 *"페이지를 정확히 인지하는 것이 중요하겠다"*).
     *
     * 🔴 **왜 화면 분류에 얹지 않는가** — 픽커 상세를 가르는 낱말은 «넘기기»·«수락하기» 둘뿐인데 둘 다 **수락 «전»의 표식**이다.
     *    «상세인데 수락하기가 없으면 수락됨»으로 갈랐다가, 목록에 상세 잔상 한 줄이 남은 판을 «수락됨»으로 읽어
     *    **아무도 안 누른 콜이 잡은 콜로 승격**됐다.
     *
     * 방어 넷: ① 수락 뒤에만 있는 낱말이 실제로 보여야 한다 ② 잔상이면 그 판을 버린다 ③ 직전 화면이 «수락 전 상세»였을 때만
     * ④ 미리보기를 올린 적이 있어야 한다(`reportPickerAccepted` 안). 막히면 «어디서» 막혔는지 로그로 말한다 — 픽커는 하루 5번뿐이다.
     * 🔴 차례: 상세를 떠난 뒤 인지 → 늦은 수락 확인. 둘 다 화면 이름 보고보다 앞이다(`PickerAcceptOrderTest`).
     */
    override fun onScreenChanged(
        context: ScanContext,
        previous: com.onedal.app.models.ScreenContext,
        detected: com.onedal.app.models.ScreenContext,
        screenTexts: List<String>,
        rawScreenStr: String,
        packageName: String?,
    ) {
        val detail = com.onedal.app.models.ScreenContext.DETAIL_PRE_CONFIRM
        if (previous == detail) {
            val residue = context.scrapParser.isDetailResidue(screenTexts)
            val returnedToList = detected == com.onedal.app.models.ScreenContext.LIST || detected == com.onedal.app.models.ScreenContext.LIST_COMPLETED
            // 🔴 상세 글자만 바뀐 «상세 → 상세»는 떠난 것이 아니다 — 아무것도 적지 않는다
            val stillOnDetail = detected == detail
            when (KakaoPickerKeywords.afterDetail(returnedToList, residue, stillOnDetail)) {
                KakaoPickerKeywords.AfterDetail.STILL_ON_DETAIL -> { }
                KakaoPickerKeywords.AfterDetail.RETURNED_TO_LIST ->
                    com.onedal.app.core.AppLogger.i("1DAL_PICKER", LogTag.SCREEN, KakaoPickerKeywords.RETURNED_TO_LIST_LOG)
                KakaoPickerKeywords.AfterDetail.RESIDUE ->
                    com.onedal.app.core.AppLogger.i("1DAL_PICKER", LogTag.CALL_STAGE, "↩️ [승격 보류] 상세 글자가 남은 화면이다 — 이 화면은 버린다")
                KakaoPickerKeywords.AfterDetail.CHECK_ACCEPTED -> {
                    // 📱 실물 픽커면 운행 기록을 켠다 — 미리보기를 안 보낸 콜(손으로 연 상세)도 켠다
                    val live = TargetApp.pickerLogScope(packageName, context.currentTargetApp) == TargetApp.PickerLog.STAGE_AND_UNKNOWN
                    if (PickerTrace.shouldStart(live, KakaoPickerKeywords.AfterDetail.CHECK_ACCEPTED, acceptedScreen = false)) {
                        context.startAppTrace("상세를 떠나 목록이 아닌 화면으로 갔다 — 수락으로 본다")
                    }
                    context.reportPickerAccepted(rawScreenStr)
                }
            }
        }
        // ⏳ 늦은 수락 확인 — 퀵은 수락 → 내 오더 → 카드 → 흰 페이지라 상세 바로 뒤에는 수락 표식이 없다
        if (KakaoPickerKeywords.shouldCheckLateAcceptance(
                previousWasDetail = previous == detail,
                hasOpenDetailCall = context.session.isPreview || context.session.heldUnfilled,   // 미리보기 또는 보고 보류
                hasDetailOrder = context.session.lastDetailOrder != null,
                rawText = rawScreenStr,
            )) {
            com.onedal.app.core.AppLogger.i("1DAL_PICKER", LogTag.CALL_STAGE, "⏳ [늦은 수락 확인] 상세 바로 뒤는 아니지만 정리되지 않은 상세 콜(미리보기·보고 보류)이 남은 채 수락 뒤 화면(${detected.name})이 보인다")
            context.reportPickerAccepted(rawScreenStr)
        }
    }

    /** 📋 퀵만 하차지가 있어야 한다 — 도보는 원래 하차지가 없고, 종류를 모르면 막지 않는다 (`quickDropoffUnread`) */
    override fun allowsEmptyDropoff(order: com.onedal.app.models.SimplifiedOfficeOrder): Boolean =
        !KakaoPickerParser.quickDropoffUnread(order.tagsText, "")
}
