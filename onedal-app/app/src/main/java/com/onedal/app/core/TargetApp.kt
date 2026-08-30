package com.onedal.app.core

/**
 * 🌐 **배차망 라벨↔코드 — 매핑은 여기 한 곳뿐** (기사님 확정 2026-08-30 · 픽커_수집.md §6-전)
 *
 * 예전엔 `"24시" -> hwamul24, else -> insung` 이 HijackService·TelemetryManager 등에
 * 흩어져 있었다 — 배차망을 하나 더할 때 곳곳이 각자 갈라질 판이었다
 * (#76~#82 «한 값이 여러 곳» 클래스). 서버 쪽 표준은 shared `TARGET_APPS` 한 벌이고,
 * 앱은 Kotlin 이라 그 파일을 못 읽으므로 **여기가 앱의 한 곳**이다.
 * 값이 어긋나면 서버 수신이 기본값(insung)으로 떨어져 로그에 남는다.
 */
object TargetApp {
    const val INSUNG = "insung"
    const val HWAMUL24 = "hwamul24"
    const val KAKAOPICKER = "kakaopicker"

    /** 설정 화면 라벨 → 서버 코드. 모르는 라벨은 인성 — 오프라인 안전망과 같은 결 */
    fun codeOf(label: String?): String = when (label) {
        "24시" -> HWAMUL24
        "픽커" -> KAKAOPICKER
        else -> INSUNG
    }
}
