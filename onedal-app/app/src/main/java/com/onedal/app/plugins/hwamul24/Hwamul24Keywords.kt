package com.onedal.app.plugins.hwamul24

import com.onedal.app.core.ScreenKeywords

object Hwamul24Keywords {
    /** 화물24시 이름표 · 취소 버튼 글자 — 화면을 알아보는 글자는 배차망 정의 표(`Hwamul24Pages.screens`)에 있다 */
    val TWENTYFOUR = ScreenKeywords(appLabel = "화물24시", cancelKeyword = "돌아가기")

    /** 🖥️ 이 배차망 화면에만 있는 글자 묶음 — 원천은 shared 배차망 정의 표의 networkMarkers(`Hwamul24Pages.networkMarkers`) · 여기는 이름만 잇는다(`TargetApp.networksOnScreen` · `NetworkByScreenTest`) */
    val NETWORK_MARKERS: List<List<String>> get() = Hwamul24Pages.networkMarkers

}
