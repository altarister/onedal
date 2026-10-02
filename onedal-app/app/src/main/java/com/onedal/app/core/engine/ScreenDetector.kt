package com.onedal.app.core.engine

import com.onedal.app.core.OverlayAction
import com.onedal.app.core.OverlayKind
import com.onedal.app.core.OverlaySpec
import com.onedal.app.core.ScreenMatch
import com.onedal.app.core.ScreenSpec
import com.onedal.app.core.StandardScreen
import com.onedal.app.models.ScreenContext

/**
 * 🖥️ **이 화면은 무엇인가 — 원달앱이 본 결과**
 * @param context 원달앱 안에서 쓰는 화면 값 — 덧칸이 시키는 일(팝업 채우기 POPUP_* · 오류 POPUP_ERROR)과 목록 복귀(LIST_COMPLETED)를 담는다(처리 갈래 · 상세 대기 · 목록 복귀가 이 값을 본다)
 * @param wire 서버로 보내는 화면 값 — 페이지 값 그대로(상세 위 팝업도 DETAIL_* · 내 오더는 MY_ORDERS) · 덧칸 이름과 페이지 이름이 따로 간다(reviews/35 5단계)
 * @param page 배차망 페이지 이름(없으면 null) · @param overlay 그 위에 뜬 것 이름(팝업 · 토스트 · 띠 — 없으면 null)
 * @param skip 건너뛰는 화면(로딩 등)이 덮여 있다 — 이 프레임은 처리하지 않는다
 */
data class ScreenRead(val context: ScreenContext, val wire: ScreenContext, val page: String?, val overlay: String?, val skip: Boolean)

/**
 * 화면 판별 — **그 배차망 정의 표(`…Pages.screens`)의 차례대로, 처음 맞는 페이지** (reviews/35 2 · 5단계).
 * 이 파일에는 배차망 글자가 없다 — 글자는 표(shared `networkPages.ts` → `pnpm gen:pages`)에만 있다.
 *
 * 차례:
 *   1. action = SKIP 인 덧칸이 보이면 skip (페이지 판별은 따로 한다 — 붙는 순간 화면은 skip 을 안 본다)
 *   2. 처음 맞는 페이지 → 그 페이지의 덧칸 중 할 일(action)이 있는 것이 맞으면 그 일, 이름은 맞는 팝업 · 토스트 · 띠 중 첫째
 *   3. 맞는 페이지가 없으면 글자가 맞는 덧칸(알림 갈래 빼고)의 주인 페이지 — 주인이 여럿이면 직전 페이지(`lastPage`)를 먼저
 *      (인성 출발지 팝업은 확정 전 · 확정 뒤 상세 둘 위에 뜨고, 실물 팝업은 화면 전체를 덮어 페이지 글자가 안 보인다)
 *   4. 그 밖은 UNKNOWN
 */
class ScreenDetector {

    fun detect(text: String, screens: List<ScreenSpec>, lastPage: String? = null): ScreenRead {
        val skip = screens.any { s -> s.overlays.any { it.action == OverlayAction.SKIP && hits(it.match, text) } }
        val page = screens.firstOrNull { hits(it.match, text) }
        if (page != null) {
            val acted = page.overlays.firstOrNull { it.action != null && it.action != OverlayAction.SKIP && hits(it.match, text) }
            val named = acted ?: page.overlays.firstOrNull { shows(it) && hits(it.match, text) }
            return read(page, acted, named, skip)
        }
        val ordered = screens.filter { it.name == lastPage } + screens.filter { it.name != lastPage }
        for (s in ordered) for (o in s.overlays) {
            if (o.action != null && o.action != OverlayAction.SKIP && hits(o.match, text)) return read(s, o, o, skip)
        }
        for (s in ordered) for (o in s.overlays) {
            if (o.action == null && o.kind != OverlayKind.NOTICE && hits(o.match, text)) return read(s, null, o, skip)
        }
        return ScreenRead(ScreenContext.UNKNOWN, ScreenContext.UNKNOWN, null, null, skip)
    }

    private fun read(page: ScreenSpec, acted: OverlaySpec?, named: OverlaySpec?, skip: Boolean): ScreenRead {
        val wire = wireOf(page)
        val inside = acted?.action?.let(::contextOf) ?: if (wire == ScreenContext.MY_ORDERS && page.listReturn) ScreenContext.LIST_COMPLETED else wire
        return ScreenRead(inside, wire, page.name, named?.name, skip)
    }

    /** 덧칸 이름을 배지에 싣나 — 화면을 덮는 것(팝업 · 토스트)만 · 늘 붙어 있는 띠와 알림 사건은 안 싣는다 */
    private fun shows(o: OverlaySpec): Boolean = o.action != OverlayAction.SKIP && (o.kind == OverlayKind.POPUP || o.kind == OverlayKind.TOAST)

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

    /** 우리 기준 페이지 → 서버로 보내는 화면 값 — 못 정한 페이지는 UNKNOWN */
    private fun wireOf(s: ScreenSpec): ScreenContext = when (s.standard) {
        null -> ScreenContext.UNKNOWN
        StandardScreen.MY_ORDERS -> ScreenContext.MY_ORDERS
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

    /** 덧칸이 시키는 일 → 원달앱 안 화면 값(처리 갈래가 본다) */
    private fun contextOf(a: OverlayAction): ScreenContext = when (a) {
        OverlayAction.SKIP -> ScreenContext.UNKNOWN
        OverlayAction.FILL_PICKUP -> ScreenContext.POPUP_PICKUP
        OverlayAction.FILL_DROPOFF -> ScreenContext.POPUP_DROPOFF
        OverlayAction.FILL_MEMO -> ScreenContext.POPUP_MEMO
        OverlayAction.ERROR -> ScreenContext.POPUP_ERROR
    }
}
