package com.onedal.app.core

import com.onedal.app.models.ScreenContext

/**
 * 🔔 **삑 — 서버가 상세 보고를 받았다고 답하면 그 콜에 한 번** (29 N5 · P4 · 34 «정해 쓰는 것»).
 * 못 받았으면 판정도 안 뜨니 울리지 않는다(부르는 쪽이 받은 때만 부른다). 누가 상세에 진입시켰든 · 모드와 상관없이.
 */
object DetailBeep {
    fun wanted(orderId: String, lastBeeped: String?): Boolean = orderId.isNotEmpty() && orderId != lastBeeped
}

/**
 * 🔔 **확정 안 된 벨 콜 — 원달앱 폰이 2초마다** (29 N6 ② · 기사님 Q7 «가»).
 * 서버가 «이 폰이 울릴 콜»(`ringOrderId` · shared `previewRings`)로 준 콜이 지금 콜이고 확정 전 상세일 때만 —
 * 목록으로 오거나 · 확정 화면이 되거나 · 칸이 빠지면(결재 · 상세 떠남) 다음 차례에 멈춘다.
 */
object PreviewRing {
    const val EVERY_MS = 2_000L
    fun rings(ringOrderId: String?, currentOrderId: String, screen: ScreenContext): Boolean =
        !ringOrderId.isNullOrEmpty() && ringOrderId == currentOrderId && screen == ScreenContext.DETAIL_PRE_CONFIRM
}
