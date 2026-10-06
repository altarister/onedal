package com.onedal.app.core

/**
 * 🔒 **서버가 앞 콜을 심사 중인가 — 이 폰 몫(PHONE)의 값이 먼저** (`EvaluatingNowTest`).
 *
 * 필터 안의 evaluatingNow 는 상세 중 true · 목록 false 로 갈려, 그 칸 하나로 필터 버전이 30초마다 바뀌었다.
 * 서버는 공급 필터에서 이 칸을 빼고 폰마다 따로 보낸다(관제앱 PHONE · reviews/50 ①-3). 저장 값이 없으면 필터 안 값을 쓴다.
 */
object EvaluatingNow {
    fun of(top: Boolean?, inFilter: Boolean): Boolean = top ?: inFilter

    const val KEY = "evaluatingNow"
    /** 앱 저장소 이름 — 관제앱이 블루투스로 준 이 폰 몫(PHONE)의 심사 중 값 (reviews/50 ①-3) */
    const val PREF_KEY = "evaluatingNowTop"
}
