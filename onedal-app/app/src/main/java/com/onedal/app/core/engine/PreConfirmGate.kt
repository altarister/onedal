package com.onedal.app.core.engine

/**
 * 🚪 **확정 전 화면(DETAIL_PRE_CONFIRM) 처리를 건너뛸 것인가**
 *
 * 이미 선점 보고를 했으면(`isDetailScrapSent`) 이 화면에서 할 일이 끝났다.
 * 인성은 팝업 3장으로 채운 뒤 상세로 돌아와서야 보고하므로, 채우는 동안에는 이 표시가 꺼져 있어 건너뛰지 않는다.
 */
object PreConfirmGate {
    fun shouldSkip(isDetailScrapSent: Boolean): Boolean = isDetailScrapSent
}
