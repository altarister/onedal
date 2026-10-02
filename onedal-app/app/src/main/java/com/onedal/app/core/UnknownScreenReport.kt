package com.onedal.app.core

import java.time.LocalDate

/**
 * 🔎 **원달앱이 못 알아본 배차망 화면을 운영센터 «이상 기록»에 남긴다** — «SCREEN_UNKNOWN: 글 앞부분» (기사님 «어»).
 *
 * 그 글자가 «어느 낱말이 빠졌나»를 고르는 재료다. 운행 동작은 안 바꾼다 — 화면 처리 · 로그는 그대로, 올리기만 더한다.
 * - **실물 배차망 앱 안의 화면만** — 패키지 모름 · 원달앱 자신 · 시뮬레이터 앱은 안 올린다(시뮬은 로그로 이미 본다 ·
 *   시뮬만 돌 때 올리면 실물 읽기 0 줄이라 운영센터 «비상» 단계가 오를 수 있다)
 * - **10자 미만은 안 올린다** — 화면이 넘어가는 찰나(«0자»)
 * - 목록 잔재(isListResidue)로는 거르지 않는다 — 픽커는 «오더카드 대기 중»을 목록 낱말로 보는데, 그 화면이 올라가야 한다
 * - **같은 배차망 · 같은 지문은 하루 한 번** — 지문은 숫자가 든 토막(거리 · 요금 · 시각)과 3자 이하 토막(지역 · 배지)을 뺀 낱말 집합.
 *   목록 줄만 바뀐 같은 화면이 매번 올라가지 않는다
 * - 전화 · 동호는 가린다(`mask`) — 사람 이름은 꼴로 못 가려 200자로 자른다
 * 보내는 손(`sink`)은 `HijackService` 가 단다(`POST /api/telemetry/anomalies`) — 그 손이 1초 뒤 사진을 같이 싣는다(`UnknownScreenShot`).
 * 사진은 가리지 않은 원본이고 글만 여기서 가린다.
 */
object UnknownScreenReport {
    private const val MIN_CHARS = 10
    private const val ONEDAL_PACKAGE = "com.onedal.app"

    /** (배차망 code, 사유 글, 가린 화면 글 앞 200자) */
    @Volatile var sink: ((String, String, String) -> Unit)? = null

    private var day: LocalDate = LocalDate.now()
    private val sent = mutableSetOf<String>()

    private val PHONE = Regex("""0\d{1,2}-?\d{3,4}-?\d{4}""")
    private val DONG_HO = Regex("""\d+동\s?\d+호""")
    private val HAS_DIGIT = Regex("""\d""")

    /** 안 올리는 까닭 — null 이면 올린다 */
    fun whyNot(pkg: String?, text: String): String? = when {
        pkg == null -> "패키지 모름"
        pkg == ONEDAL_PACKAGE -> "원달앱 화면"
        pkg == TargetApp.SIMULATOR_PACKAGE || pkg.lowercase().contains("simulator") -> "시뮬레이터 앱"
        text.trim().length < MIN_CHARS -> "짧은 글(${text.trim().length}자)"
        else -> null
    }

    /** 같은 화면인가 — 숫자 든 토막 · 3자 이하 토막을 뺀 낱말 집합 */
    fun fingerprintOf(text: String): String =
        text.split(Regex("""\s+""")).filter { it.length >= 4 && !HAS_DIGIT.containsMatchIn(it) }.distinct().sorted().joinToString(" ")

    fun mask(text: String): String = text.replace(PHONE, "0**-****-****").replace(DONG_HO, "#동 #호")

    /** 로그에 붙일 한 마디를 돌려준다 — «운영센터 올림» · «운영센터 안 올림(까닭)» */
    @Synchronized
    fun record(network: String, pkg: String?, text: String, today: LocalDate = LocalDate.now()): String {
        whyNot(pkg, text)?.let { return "운영센터 안 올림($it)" }
        if (today != day) { day = today; sent.clear() }
        if (!sent.add("$network|${fingerprintOf(text)}")) return "운영센터 안 올림(오늘 같은 화면 올림)"
        val masked = mask(text.trim())
        sink?.invoke(network, "SCREEN_UNKNOWN: ${masked.take(40)}", masked.take(200))
        return "운영센터 올림"
    }
}
