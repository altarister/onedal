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

    /** 코드 → 설정 라벨 (자동 전환이 라디오·프리퍼런스를 같은 말로 되돌릴 때) */
    fun labelOf(code: String): String = when (code) {
        HWAMUL24 -> "24시"
        KAKAOPICKER -> "픽커"
        else -> "인성콜"
    }

    /**
     * 🌐 **화면 패키지 → 배차망** (기사님 확정 2026-08-31 · 규칙 ③ 파생).
     * «어느 배차망인가»의 진짜 원천은 라디오가 아니라 지금 보고 있는 화면이다.
     * 모르는 패키지는 null — 지어내지 않는다 (카톡·설정 화면 등은 배차망이 아니다).
     */
    fun codeOfPackage(pkg: String?): String? = when (pkg) {
        "com.kakaomobility.flexer" -> KAKAOPICKER            // 카카오T픽커 (0830 실측)
        "com.onedal.simulator" -> INSUNG                     // 우리 인성 시뮬레이터
        "com.insungdata.smartorder1" -> INSUNG               // 인성 실앱 (미실측 — 설치 후 확인)
        else -> null
    }

    /**
     * 🚧 **이 배차망에 «잡기 시퀀스»가 있는가** (기사님 확정 2026-08-30 · 픽커_수집.md §3-확장).
     *
     * 잡는 수순은 배차망마다 완전히 다르다 — 인성은 상세→팝업3장→확정, 픽커는
     * 수락한 **뒤에야** 주소가 나온다. 지금 공용 코드의 수순은 인성 모양이라,
     * 수순이 없는 배차망에서 돌면 엉뚱한 화면을 누른다.
     *
     * `false` 면 앱은 **인성 잡기 수순을 타지 않는다** — 인성 전용 화면(확정 후·팝업 3종)
     * 처리와 AUTO 모드의 리스트 자동 클릭을 건너뛴다.
     *
     * 🔴 **«아무것도 안 누른다»는 뜻이 아니다** (기사님 교정 2026-09-02).
     *    *"알람일 때 «수락하기» 버튼만 클릭하지 못하는 것이고, 나머지는 계약과 관련
     *    없으므로 어떤 것도 클릭 가능하다."* — 실제로 **알람일 때는 그 콜의 상세까지
     *    들어간다**(`scheduleAlarmDetailBack`). 막아야 하는 단 하나는 **계약 버튼**이고,
     *    그건 이 함수가 아니라 `KakaoPickerParser.clickSafe`(«수락» 글자가 보이면 손대지
     *    않는다)가 막는다. 픽커는 되돌릴 창이 없어서(전화만·하루 5번) 계약이 곧 확정이다.
     *
     * 이 함수를 읽는 자리들이 곧 «인성 전용 구간»이다 (🚧 주석) —
     * 픽커로 잡기를 시작하는 날, 그 표시를 따라 인성 수순을 떼어낸다.
     */
    fun supportsCatching(code: String): Boolean = when (code) {
        KAKAOPICKER -> false   // 수순 미구현 — 수집·알람 전용 (1차 확정)
        else -> true
    }
}
