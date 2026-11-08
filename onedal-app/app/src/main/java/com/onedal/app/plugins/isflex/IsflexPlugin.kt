package com.onedal.app.plugins.isflex

import android.content.Context
import com.onedal.app.core.AppTrace
import com.onedal.app.core.IScrapParser
import com.onedal.app.core.OpenBlocked
import com.onedal.app.core.ScreenKeywords
import com.onedal.app.core.ScreenOcrParser
import com.onedal.app.core.ScreenTextNode
import com.onedal.app.core.TapShift
import com.onedal.app.core.TargetApp
import com.onedal.app.core.engine.ScanContext
import com.onedal.app.models.FilterConfig
import com.onedal.app.models.ScreenContext
import com.onedal.app.models.SimplifiedOfficeOrder
import com.onedal.app.plugins.IDispatchAppPlugin
import com.onedal.app.plugins.ListTap
import java.time.LocalDateTime

/**
 * 🟣 **인성플렉스 플러그인** — 알람 + 손 확정
 *
 * - 모드 · 패키지 글자 · 페이지 · 배차망 표식 · 손 수락 화면(`landsAfterAccept`)은 배차망 정의 표(`IsflexPages`)에서 온다
 * - 계약 단추(«…원 수행하기»)를 누르지 않는다 (`acceptButtons = null`) — 확정 뒤 앱에서 무를 수 없고 취소마다 다음 확정이 막힌다
 * - 사진 판독기 없음 — 접근성 글자를 읽는다 (`ocrParser = null`)
 * - 상세 주소는 상세 글에서 채운다 (`fillDetail`) — 안 채우면 목록 값(동까지)으로 가서 요건 검사가 버린다
 * - 빈 하차 목록 = 보류(기본 `allowsEmptyDropoff`) — 인성 · 화물24시와 같다
 */
class IsflexPlugin(private val context: Context? = null) : IDispatchAppPlugin {

    override val code: String = TargetApp.ISFLEX
    override val label: String = "플렉스"
    override val packageKeywords: List<String> get() = IsflexPages.packageKeywords
    override val keywords: ScreenKeywords = IsflexKeywords.FLEX
    override val networkMarkers: List<List<String>> get() = IsflexPages.networkMarkers
    override val parser: IScrapParser by lazy { IsflexParser(context) }

    override val availableModes: Set<String> get() = IsflexPages.modes

    /** 📄 페이지 정의 — `IsflexPages` */
    override val pages get() = IsflexPages.pages
    override val addressCut get() = IsflexPages.addressCut
    override val screens get() = IsflexPages.screens

    override val acceptButtons: List<String>? = null

    override val ocrParser: ScreenOcrParser<*>? = null

    /** ⏱️ 어느 설정 칸인지는 배차망 정의 표(`IsflexPages.safeCancelSecKey` · `detailBackSecKey`) */
    override fun getSafeCancelMs(filter: FilterConfig): Long? = filter.secOf(IsflexPages.safeCancelSecKey)?.times(1000L)

    override fun getDetailBackTimeoutMs(filter: FilterConfig): Long? = filter.secOf(IsflexPages.detailBackSecKey)?.times(1000L)

    /** 🧹 상세 글은 «출발지까지»부터 — 머리 «@… → …» · 지도 설명을 뗀다 */
    override fun detailTextsOf(texts: List<String>): List<String> = IsflexParser.detailTextsOf(texts)

    /** 🏠 상세 «출발» · «도착» 전체 주소 · 예약 · 꼬리표를 콜에 싣는다 — 못 읽은 칸은 목록 값 그대로 */
    override fun fillDetail(context: ScanContext, order: SimplifiedOfficeOrder): SimplifiedOfficeOrder =
        IsflexParser.fillFromDetail(order, LocalDateTime.now())

    override var lastHoldKey: String? = null
        private set

    /**
     * 👆 **줄 왼쪽 끝을 누른다** — 요금 자리는 상세 «…원 수행하기» 단추 자리와 겹친다(실물 08~12 단추 [366,1920][1035,2149]).
     * 누르는 찰나에 화면이 상세로 바뀌면 요금 자리 = 계약 단추다. 왼쪽 끝은 «닫기» 밖 여백이다. 아래 탭 줄이 없어 Y 는 요금 가운데 그대로.
     */
    override fun planListTap(allNodes: List<ScreenTextNode>, order: SimplifiedOfficeOrder, fareNode: ScreenTextNode): ListTap? {
        val scanY = fareNode.rect.centerY()
        val nowY = fareNode.node.takeIf { it.refresh() }?.let { n -> android.graphics.Rect().also { n.getBoundsInScreen(it) }.centerY() }
        val hold = holdOf(allNodes.map { it.text }, scanY, nowY)
        lastHoldKey = hold
        if (hold != null) {
            if (com.onedal.app.core.LogOnce.changed("flex-hold:${com.onedal.app.core.CallMemory.fingerprintOf(order)}", hold))
                com.onedal.app.core.AppLogger.w("1DAL_ALARM", "🛑 [상세 진입 보류] 플렉스 ${order.fare}원 — $hold (요금 Y 스캔 $scanY · 지금 ${nowY ?: "못 읽음"}) · 손대지 않는다")
            return null
        }
        return LIST_TAP
    }

    /** 🖥️ 직전에 알아본 인성플렉스 화면 — 홈 → 목록이면 운행 기록을 켠다 */
    private var lastDetected: ScreenContext? = null

    /**
     * 📱 **운행 기록** — 🔴 인성플렉스 화면일 때만 돈다: 실물 앱 이름이거나 지금 배차망이 인성플렉스(시뮬).
     * 원달앱은 화면을 읽을 때마다 등록된 모든 플러그인의 이 칸을 부르므로, 실물 여부(`sourceOf`)로 가르면 실물 픽커 화면에서도 돈다.
     * 켜기와 화면 글자 남기기는 실물 앱에서만 — 시뮬은 직전 화면만 기억한다.
     */
    override fun afterScreenRead(scan: ScanContext, detected: ScreenContext, rawScreenStr: String, packageName: String?) {
        if (!readsScreen(packageName, scan.currentTargetApp)) return
        if (traceStarts(packageName, previousWasHome = lastDetected == ScreenContext.HOME, nowList = detected == ScreenContext.LIST))
            scan.startAppTrace("홈에서 목록으로 들어왔다")
        if (packageName == TargetApp.ISFLEX_PACKAGE) scan.traceScreen(rawScreenStr, detected.name)
        lastDetected = detected
    }

    companion object {
        /** 👆 누를 자리 — 줄 왼쪽 끝(줄 틀 왼끝 + `TapShift.ROW_INSET_PX`) · 자국 기다림은 픽커와 같은 값 · 아래 탭 줄 보정 없음 */
        val LIST_TAP = ListTap(rowLeft = true, delayMs = TapShift.PREVIEW_MS, dy = 0)

        /**
         * 🚧 **누르기 전 안전 확인 — 보류 까닭 열쇠, 누르면 null** (`OpenBlocked` 에 있는 열쇠만).
         * ① 화면에 «수행하기»가 든 글자 ② 칸 머리 «수입»이 없다(시트가 떴다 · 화면이 바뀌었다) ③ 요금 칸을 다시 못 읽었다 ④ 다시 잰 요금 Y 가 스캔 때와 다르다(목록이 흐르는 중)
         */
        fun holdOf(screenTexts: List<String>, scanFareY: Int, nowFareY: Int?): String? = when {
            screenTexts.any { it.contains("수행하기") } -> OpenBlocked.ACCEPT_VISIBLE
            screenTexts.none { it.trim() == IsflexRowGrouping.HEADER_FARE } -> OpenBlocked.NOT_UNDER_HEADER
            nowFareY == null -> OpenBlocked.TAP_RECHECK
            TapShift.listMoving(scanFareY, nowFareY, scrolledRecently = false) -> OpenBlocked.LIST_MOVING
            else -> null
        }

        /** 🖥️ 이 화면이 인성플렉스 몫인가 — 실물 앱 이름 또는 지금 배차망(시뮬은 네 배차망을 한 앱으로 띄운다) */
        fun readsScreen(packageName: String?, currentTarget: String): Boolean =
            packageName == TargetApp.ISFLEX_PACKAGE || currentTarget == TargetApp.ISFLEX

        /** 📱 운행 기록을 켜나 — 실물 인성플렉스 앱에서 홈 다음 목록일 때만 */
        fun traceStarts(packageName: String?, previousWasHome: Boolean, nowList: Boolean): Boolean =
            AppTrace.startsFromHome(live = packageName == TargetApp.ISFLEX_PACKAGE, previousWasHome = previousWasHome, nowList = nowList)
    }
}
