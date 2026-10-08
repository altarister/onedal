package com.onedal.app.core

/**
 * 🔒 **서버가 앞 콜을 심사 중인가 — 이 폰 몫(PHONE)의 값이 먼저** (`EvaluatingNowTest`).
 *
 * 필터 안의 evaluatingNow 는 상세 중 true · 목록 false 로 갈려, 그 칸 하나로 필터 버전이 30초마다 바뀌었다.
 * 서버는 공급 필터에서 이 칸을 빼고 폰마다 따로 보낸다(관제앱 PHONE). 저장 값이 없으면 필터 안 값을 쓴다.
 * 🔓 끊긴 동안 저장된 값은 믿지 않는다 — 믿을 수 없으면 «심사 중 아님»(29 X5 · X6 ② 가 · 픽커 알람이 굳은 값에 막히지 않게).
 */
object EvaluatingNow {
    fun of(top: Boolean?, inFilter: Boolean, trusted: Boolean): Boolean = trusted && (top ?: inFilter)

    /**
     * 저장된 «심사 중»을 믿을 수 있나 — 서비스가 뜬 뒤 이 폰 몫을 한 번이라도 받았고(다시 뜨면 옛 값),
     * 블루투스 · 관제앱 서버가 둘 다 살아 있거나 원달앱 인터넷이 서버에 닿을 때(그동안은 인터넷 길이 1초마다 새 값을 준다).
     */
    fun trusted(heardSinceStart: Boolean, linked: Boolean, serverAlive: Boolean, replying: Boolean): Boolean =
        heardSinceStart && ((linked && serverAlive) || replying)

    /** 필터 · 관제앱 PHONE 본문의 «심사 중» 칸 이름 — 서버 · 관제앱(SupplyService.java)과 같은 글자 */
    const val KEY = "evaluatingNow"
    /** 앱 저장소 이름 — 관제앱이 블루투스로 준 이 폰 몫(PHONE)의 심사 중 값 */
    const val PREF_KEY = "evaluatingNowTop"
}
