package com.onedal.app.core.engine

import com.onedal.app.core.OverlayKind
import com.onedal.app.core.ReportAs
import com.onedal.app.core.ScreenMatch
import com.onedal.app.core.ScreenSpec
import com.onedal.app.core.StandardScreen
import com.onedal.app.models.ScreenContext

/**
 * 🖥️ **이 화면은 무엇인가 — 원달앱이 본 결과**
 * @param context 서버 · 관제웹에 보내는 화면 값
 * @param page 맞은 배차망 페이지 이름(없으면 null) · @param overlay 그 위에 뜬 것 중 맞은 이름
 * @param skip 건너뛰는 화면(로딩 등)이 덮여 있다 — 이 프레임은 처리하지 않는다
 */
data class ScreenRead(val context: ScreenContext, val page: String?, val overlay: String?, val skip: Boolean)

/**
 * 화면 판별 — **그 배차망 정의 표(`…Pages.screens`)의 차례대로, 처음 맞는 페이지** (reviews/35 2단계).
 * 이 파일에는 배차망 글자가 없다 — 글자는 표(shared `networkPages.ts` → `pnpm gen:pages`)에만 있다.
 *
 * 차례:
 *   1. reportAs = SKIP 인 덧칸이 보이면 skip (페이지 판별은 따로 한다 — 붙는 순간 화면은 skip 을 안 본다)
 *   2. 처음 맞는 페이지 → 그 페이지의 덧칸 중 reportAs 가 있는 것이 맞으면 그 값, 아니면 페이지의 기준 값
 *   3. 맞는 페이지가 없으면 reportAs 가 있는 덧칸 → 없으면 글자가 맞는 팝업 덧칸의 주인 페이지 기준 값
 *   4. 그 밖은 UNKNOWN
 */
class ScreenDetector {

    fun detect(text: String, screens: List<ScreenSpec>): ScreenRead {
        val skip = screens.any { s -> s.overlays.any { it.reportAs == ReportAs.SKIP && hits(it.match, text) } }
        val page = screens.firstOrNull { hits(it.match, text) }
        if (page != null) {
            val o = page.overlays.firstOrNull { it.reportAs != null && it.reportAs != ReportAs.SKIP && hits(it.match, text) }
            return ScreenRead(o?.reportAs?.let(::contextOf) ?: contextOf(page), page.name, o?.name, skip)
        }
        for (s in screens) for (o in s.overlays) {
            if (o.reportAs != null && o.reportAs != ReportAs.SKIP && hits(o.match, text)) return ScreenRead(contextOf(o.reportAs), null, o.name, skip)
        }
        for (s in screens) for (o in s.overlays) {
            if (o.reportAs == null && o.kind == OverlayKind.POPUP && hits(o.match, text)) return ScreenRead(contextOf(s), s.name, o.name, skip)
        }
        return ScreenRead(ScreenContext.UNKNOWN, null, null, skip)
    }

    /** 갈래 중 하나만 맞아도 — 빈 목록은 «아직 모름»이라 안 맞는다 · 알림 덧칸(화면 글이 아니라 알림 사건 글)도 이것으로 본다 */
    fun hits(match: List<ScreenMatch>, text: String): Boolean = match.any { matches(it, text) }

    private fun matches(m: ScreenMatch, text: String): Boolean {
        if (m.all.isEmpty() && m.any.isEmpty() && m.shape == null) return false
        if (!m.all.all { text.contains(it) }) return false
        if (m.any.isNotEmpty() && m.any.none { text.contains(it) }) return false
        if (m.none.any { text.contains(it) }) return false
        val shape = m.shape ?: return true
        val n = shape.findAll(text).count()
        return (m.shapeMin == null || n >= m.shapeMin) && (m.shapeMax == null || n <= m.shapeMax)
    }

    /** 우리 기준 페이지 → 화면 값 — 내 오더는 «목록 복귀인가»가 가른다 · 못 정한 페이지는 UNKNOWN */
    private fun contextOf(s: ScreenSpec): ScreenContext = when (s.standard) {
        null -> ScreenContext.UNKNOWN
        StandardScreen.MY_ORDERS -> if (s.listReturn) ScreenContext.LIST_COMPLETED else ScreenContext.MY_ORDERS
        StandardScreen.HOME -> ScreenContext.HOME
        StandardScreen.LIST -> ScreenContext.LIST
        StandardScreen.DETAIL_PRE_CONFIRM -> ScreenContext.DETAIL_PRE_CONFIRM
        StandardScreen.DETAIL_CONFIRMED -> ScreenContext.DETAIL_CONFIRMED
        StandardScreen.RUN_TO_PICKUP -> ScreenContext.RUN_TO_PICKUP
        StandardScreen.RUN_AT_PICKUP -> ScreenContext.RUN_AT_PICKUP
        StandardScreen.RUN_TO_DROPOFF -> ScreenContext.RUN_TO_DROPOFF
        StandardScreen.RUN_AT_DROPOFF -> ScreenContext.RUN_AT_DROPOFF
        StandardScreen.RUN_DONE -> ScreenContext.RUN_DONE
        StandardScreen.TRANSITION -> ScreenContext.TRANSITION
        StandardScreen.NETWORK_MENU -> ScreenContext.NETWORK_MENU
        StandardScreen.OTHER_APP -> ScreenContext.OTHER_APP
    }

    private fun contextOf(r: ReportAs): ScreenContext = when (r) {
        ReportAs.SKIP -> ScreenContext.UNKNOWN
        ReportAs.LIST -> ScreenContext.LIST
        ReportAs.POPUP_PICKUP -> ScreenContext.POPUP_PICKUP
        ReportAs.POPUP_DROPOFF -> ScreenContext.POPUP_DROPOFF
        ReportAs.POPUP_MEMO -> ScreenContext.POPUP_MEMO
        ReportAs.POPUP_ERROR -> ScreenContext.POPUP_ERROR
    }
}
