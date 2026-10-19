package com.onedal.app.core

/**
 * 📲 **세션을 비울 때 안전취소 타이머를 둘까** (38 F36 · F42 · 기사님 «원달앱이 확정한 콜은 원달앱이 끝까지 책임진다» · `SafeCancelKeepTest`).
 * 가르는 사실은 «지키는 계약이 있나»(armedOrderId) 하나와 «이 페이지는 수락 뒤 배차망이 보내는 곳인가»(표의 landsAfterAccept) 하나다.
 * 배차망 전환은 놓음이 아니다 · 콜 목록 · 인성 완료 탭으로 돌아온 것은 그 콜을 놓은 것(4db86b2a)이라 끈다.
 */
object SafeCancelKeep {
    /** 🔄 배차망 전환 — 지키는 계약이 있으면 둔다 */
    fun onSwitch(armedOrderId: String?): Boolean = armedOrderId != null

    /** 📋 목록 복귀 — 수락 뒤 배차망이 보낸 페이지(화물24시 배차신청 뒤 «배차내역»으로 오는 배차내역 목록)면 둔다 · 그 밖의 목록은 놓음 */
    fun onListReturn(armedOrderId: String?, landsAfterAccept: Boolean): Boolean = armedOrderId != null && landsAfterAccept

    /** 🖐️ 그 배차망 정의 표에서 이 페이지가 수락 뒤 배차망이 보내는 곳인가 — 모르면 거짓 */
    fun landsAfterAccept(screens: List<ScreenSpec>, page: String?): Boolean =
        page != null && screens.any { it.name == page && it.landsAfterAccept }
}
