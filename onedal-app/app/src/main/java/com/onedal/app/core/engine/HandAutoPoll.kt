package com.onedal.app.core.engine

/**
 * ⚡ **«손 클릭 AUTO» — 1초 보고를 10초 켤까** (29 사실 ③ · 31 P0 A6).
 * 원달앱이 계약하지 않는 콜(기사님 손 · 확정 안 누름)인데 지금 모드가 계약하는 모드(자동)면 켠다 — 같은 식을 그대로 옮긴 값 함수.
 */
object HandAutoPoll {
    fun wanted(contractedByApp: Boolean, modeContracts: Boolean): Boolean = !contractedByApp && modeContracts
}
