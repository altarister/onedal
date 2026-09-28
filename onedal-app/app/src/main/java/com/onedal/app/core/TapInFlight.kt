package com.onedal.app.core

import com.onedal.app.models.ScreenContext

/**
 * 👆 **누른 뒤 먹혔나 — 어느 화면이든 같은 한 규칙** (기사님 «어떤 페이지든 못 눌릴 수 있고 그걸 감지할 무언가가 있어야 한다»)
 *
 * 진행 중인 누르기는 하나다(무엇 · 누를 때의 화면 종류 · 누른 시각). 판정은 화면 **종류**로 한다 — 글자는 시계 한 글자에도 바뀐다.
 *   · 종류가 바뀌었다 → 먹혔다(기록 비움)
 *   · 종류는 같은데 글자만 바뀌었다 → 판정하지 않는다(반쯤 열린 팝업 · 목록 새로고침)
 *   · 종류도 글자도 그대로이고 «끝났다» 알림(onCompleted)이 왔다 → **안 먹혔다**(보고 · 기록 비움 → 부르는 쪽이 다음 알림에서 다시 누른다)
 * 같은 무엇 · 같은 화면 종류의 누르기가 진행 중이면 다시 보내지 않는다. **다른 무엇은 막지 않는다** — 팝업을 여닫는 길은
 * «닫기» 뒤 0.2~0.4초에 다음 버튼을 눌러야 한다(`TapShift.blockedByPending` 주석). 덮인 누르기는 판정하지 않는다 — 다음 누르기가 곧 증거다.
 * 🔗 «쏘기 전» 예약이 쌓이는 것은 `AutoTouchManager.pendingTapAtMs` 가 막는다 — 이것은 «쏜 뒤»다. 다른 질문이라 따로 둔다.
 */
object TapInFlight {
    /** «끝났다» 알림(onCompleted)은 2~4초 늦게 온다(09-13 실측 · AutoTouchManager 주석) — 알림이 사라져도 이만큼 뒤엔 스스로 푼다 */
    const val SETTLE_MAX_MS = 5_000L

    /**
     * 누른 뒤 이만큼은 «화면 그대로»를 판정하지 않는다 — 누른 앱이 화면을 바꿀 시간(화면 읽기 한 바퀴쯤).
     * 뒤로 가기는 «끝났다» 알림이 없어 누르는 순간 끝남으로 적고, 화면이 움직이는 0.3~0.5초 사이에도 같은 글자 알림이
     * 온다(09-29 로그 · 같은 상세 알림이 14ms 간격). 그 알림을 실패로 읽으면 또 눌러 막으려던 두 번 누르기가 난다.
     */
    const val SETTLE_MIN_MS = 1_000L

    data class Record(
        val seq: Long,
        val key: String,
        val screen: ScreenContext,
        val firedAtMs: Long,
        val completed: Boolean = false,
        /** 시스템이 무시해 한 번 다시 누른 것인가 — 또 무시되면 실패다 */
        val refired: Boolean = false,
    )

    enum class Verdict { NONE, TAKEN, NOT_TAKEN, EXPIRED }

    /** 안 먹힘 보고 — 무엇 · 누를 때 화면 종류 · 기다린 ms · 까닭 · 같은 무엇의 연속 실패 횟수 */
    data class Failure(val key: String, val screen: ScreenContext, val waitedMs: Long, val reason: String, val streak: Int)

    /** 같은 무엇 · 같은 화면 종류의 누르기가 아직 진행 중인가 — 그러면 보내지 않는다 */
    fun blocks(rec: Record?, key: String, screen: ScreenContext, nowMs: Long): Boolean =
        rec != null && rec.key == key && rec.screen == screen && nowMs - rec.firedAtMs < SETTLE_MAX_MS

    /** 화면 알림마다 — `textChanged` 는 화면 글자(지문)가 바뀌었나 */
    fun judge(rec: Record?, screen: ScreenContext, textChanged: Boolean, nowMs: Long): Verdict = when {
        rec == null -> Verdict.NONE
        screen != rec.screen -> Verdict.TAKEN
        nowMs - rec.firedAtMs >= SETTLE_MAX_MS -> Verdict.EXPIRED
        !textChanged && rec.completed && nowMs - rec.firedAtMs >= SETTLE_MIN_MS -> Verdict.NOT_TAKEN
        else -> Verdict.NONE
    }

    /**
     * 시스템이 무시했다(onCancelled) — 다시 누를까. 늦게 온 알림이 **지금 기억하는 그 누르기**의 것이고, 아직 한 번도 다시 안 눌렀고,
     * 누를 때의 화면 종류가 지금도 같을 때만. 그 사이 다른 누르기로 바뀌었거나 화면이 넘어갔으면 그 자리는 다른 화면이다.
     */
    fun shouldRefire(current: Record?, callbackSeq: Long, screenNow: ScreenContext): Boolean =
        current != null && current.seq == callbackSeq && !current.refired && current.screen == screenNow
}
