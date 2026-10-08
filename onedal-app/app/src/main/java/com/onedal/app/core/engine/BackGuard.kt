package com.onedal.app.core.engine

import com.onedal.app.models.ScreenContext

/** 🔙 **결재 뒤 «뒤로»를 누를 때인가** — 지금 확정 전 상세일 때만 · 결재가 늦어 이미 목록이면 누르지 않는다(시뮬 홈으로 가 콜이 멈춘다) (31 P0 A5) */
object BackGuard {
    fun onPreConfirm(screen: ScreenContext): Boolean = screen == ScreenContext.DETAIL_PRE_CONFIRM
}
