package com.onedal.app.core

/**
 * 📲 **그 배차망 앱을 앞으로 불러오는 길** (38 F36 · `NetworkFrontTest`) — 값만 고른다 · 실행은 `HijackService.bringNetworkForward`.
 * 시뮬레이터는 한 앱이 «net» 신호로 배차망을 바꾼다(다시 켜지 않음 · 배차망마다 화면을 따로 듦) · 실물은 계약 때 본 패키지를 실행한다.
 * 패키지를 모르면 못 돌아간다 — 실물 인성 · 화물24시 패키지는 아직 manifest 의 queries 에 없다(이름을 알면 한 줄).
 */
object NetworkFront {
    enum class Kind { SIMULATOR, LAUNCH, NONE }

    data class How(val kind: Kind, val pkg: String?, val net: String)

    /** 시뮬레이터 껍데기 앱의 화면 — «net» 신호를 받는 곳 */
    const val SIMULATOR_ACTIVITY = "com.onedal.simulator.MainActivity"
    /** 시뮬레이터에 넘기는 배차망 신호 이름(값은 insung · hwamul24 · kakaopicker) */
    const val NET_EXTRA = "net"

    fun of(net: String, pkg: String?): How = when {
        pkg == TargetApp.SIMULATOR_PACKAGE -> How(Kind.SIMULATOR, pkg, net)
        pkg.isNullOrBlank() -> How(Kind.NONE, null, net)
        else -> How(Kind.LAUNCH, pkg, net)
    }
}
