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

    /**
     * 🚧 **이 배차망에 «잡기 시퀀스»가 있는가** (기사님 확정 2026-08-30 · 픽커_수집.md §3-확장).
     *
     * 잡는 수순은 배차망마다 완전히 다르다 — 인성은 상세→팝업3장→확정, 픽커는
     * 수락한 **뒤에야** 주소가 나온다. 지금 공용 코드의 수순은 인성 모양이라,
     * 수순이 없는 배차망에서 돌면 엉뚱한 화면을 누른다.
     *
     * `false` 면 앱은 **어떤 모드에서도 절대 클릭하지 않는다** — 수집·알람만.
     * 이 함수를 읽는 자리들이 곧 «시퀀스 플러그인 경계»다 (🚧 주석) —
     * 픽커로 잡기를 시작하는 날, 그 금을 따라 인성 수순을 떼어낸다.
     */
    fun supportsCatching(code: String): Boolean = when (code) {
        KAKAOPICKER -> false   // 수순 미구현 — 수집·알람 전용 (1차 확정)
        else -> true
    }
}
