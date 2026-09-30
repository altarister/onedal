package com.onedal.app.core

/**
 * 🔐 **기기 비밀 토큰 · 연결 풀림** (운영센터 1단계 · reviews/29 · 이름은 onedal-ab 서버와 같다 · `DeviceLinkTest`).
 * 짝(`/api/devices/pair`) 때 받은 토큰을 요청마다 [HEADER] 로 싣는다. 서버가 거절하면 까닭을 폰에 적어
 * 첫 화면 띠와 보고 간격(60초)이 읽는다. 짝이 다시 되거나 서버가 다시 받아 주면 지운다.
 */
object DeviceLink {
    const val HEADER = "X-Device-Token"
    /** 서버가 짝 때 한 번 준 토큰 원문 — 앱을 지우면 없어지고 짝을 다시 하면 덮는다 */
    const val PREF_TOKEN = "deviceToken"
    /** 연결이 풀린 까닭([WHY_UNLINKED] · [WHY_BLOCKED]) — 비면 정상 */
    const val PREF_UNLINKED = "deviceUnlinkedWhy"
    const val WHY_UNLINKED = "토큰"
    const val WHY_BLOCKED = "계정"

    /** 🔗 서버 규격 글자 — shared 값과 같아야 한다(대조 검사). 짝 응답 칸 이름은 `PairDeviceResponse.deviceToken` */
    const val PAIR_TOKEN_FIELD = "deviceToken"
    const val ERR_TOKEN_INVALID = "DEVICE_TOKEN_INVALID"
    const val ERR_NOT_PAIRED = "DEVICE_NOT_PAIRED"
    const val ERR_PIN_INVALID = "PIN_INVALID"
    const val ERR_ACCOUNT_BLOCKED = "ACCOUNT_BLOCKED"

    enum class Verdict { OK, UNLINKED, BLOCKED, OTHER }

    private val ERROR = Regex(""""error"\s*:\s*"([A-Z_]+)"""")

    /** 서버 응답 → 연결 판정. PIN 틀림(401 [ERR_PIN_INVALID])은 짝 화면 오류라 띠를 띄우지 않는다 */
    fun verdict(code: Int, body: String?): Verdict {
        if (code in 200..299) return Verdict.OK
        val error = body?.let { ERROR.find(it)?.groupValues?.get(1) }
        return when {
            code == 401 && (error == ERR_TOKEN_INVALID || error == ERR_NOT_PAIRED) -> Verdict.UNLINKED
            code == 403 && error == ERR_ACCOUNT_BLOCKED -> Verdict.BLOCKED
            else -> Verdict.OTHER
        }
    }

    /** 식별 id — 폰 이름과 따로 둔 긴 난수(표시 이름은 짝 때 보내는 deviceName) */
    fun newDeviceId(): String = "d-" + java.util.UUID.randomUUID().toString()

    /** 첫 화면 띠 글 — 비면 띠 없음 */
    fun bannerOf(why: String?): String? = when (why) {
        WHY_UNLINKED -> "폰 연결이 끊겼습니다 — 다시 연결"
        WHY_BLOCKED -> "이용이 멈췄습니다"
        else -> null
    }
}
