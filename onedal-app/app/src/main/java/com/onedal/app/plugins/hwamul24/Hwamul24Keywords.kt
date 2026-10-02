package com.onedal.app.plugins.hwamul24

import com.onedal.app.core.ScreenKeywords

object Hwamul24Keywords {
    /** 화물24시 이름표 · 취소 버튼 글자 — 화면을 알아보는 글자는 배차망 정의 표(`Hwamul24Pages.screens`)에 있다 */
    val TWENTYFOUR = ScreenKeywords(appLabel = "화물24시", cancelKeyword = "돌아가기")

    /**
     * 🖥️ **이 배차망 화면에만 있는 글자 묶음** — 스캔앱이 화면 글자로 배차망을 가를 때 쓴다
     * (기사님 확정 · `TargetApp.networksOnScreen`). 묶음 안 글자가 **전부** 보여야 이 배차망이다.
     * 🔴 **일부러 표와 따로 둔다** — 배차망을 가르는 글자는 다른 배차망 화면에 없어야 해서(`NetworkByScreenTest`) 표의 페이지 글자와 고르는 기준이 다르다.
     *    표에서 고르는 일은 reviews/35 4단계에서 한다.
     */
    val NETWORK_MARKERS: List<List<String>> = listOf(listOf("화물정보", "자동새로고침"), listOf("화물상세정보", "운송료"))
}
