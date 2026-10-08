package com.onedal.app.core

/**
 * 👆 **목록에서 누를 콜을 고르는 판단 — 값만 받아 값을 낸다** (`HijackService.handleListScreen` 루프 뒤).
 * 판단 조각(`HandFirst` · `AlarmHold` · `EvaluatingNow` · `TapShift`)을 **어떤 차례 · 조건으로 엮나**가 여기 있다 — 엮는 줄이 빠지면 좋은 콜을 놓치거나 엉뚱한 콜을 누른다.
 * 상태가 있는 일(`alarmHold.decide` · `handFirst.hold` · 기다림 걸기 · 로그 · 누르기)은 서비스가 하고, 여기는 «무엇을 해야 하나»만 답한다.
 * 🔴 «심사 중»은 읽기 함수로 받는다 — 지금처럼 그 차례에 닿았을 때만 읽는다(앞 조건에서 멈추면 안 읽는다).
 */
object ListTapPick {

    /** 루프 뒤 사실 — `hold` 는 `alarmHold.decide` 를 부른 때(«목록에서 누르는 모드 · 앱이 안 연 때»)만 값이 있다 */
    data class GateFacts(
        val tapsList: Boolean,
        val openedByApp: Boolean,
        val hasBest: Boolean,
        val handBlocks: Boolean,
        val hold: AlarmHold.Kind?,
        val evaluating: () -> Boolean,
    )

    /**
     * @property openBlocked 통과 콜이 있는데 안 연 까닭(`OpenBlocked`) — 열러 가면 null(뒤 단계가 다시 정한다)
     * @property handHeld 기사님 손이 먼저 — 서비스는 `handFirst.hold` 를 걸고 «손 먼저» 줄을 남긴다
     * @property heldRecheck 알람 미룸 — 서비스는 지문을 비우고 «미룬 알람 다시 보기»를 건다
     * @property evaluatingStop 서버가 앞 콜을 심사 중이라 안 누름
     * @property planTap 배차망에게 누를 자리를 묻는다(`planListTap`)
     */
    data class Gate(
        val openBlocked: String?,
        val handHeld: Boolean,
        val heldRecheck: Boolean,
        val evaluatingStop: Boolean,
        val planTap: Boolean,
    )

    /**
     * 🚪 누르러 갈까 — 바쁨(앱이 연 콜이 있음) · ✋ 손 먼저(누르기 미룸) · ⏳ 알람 미룸 · 🔒 심사 중 · 👆 누름.
     * 누르는 것은 알람 미룸이 «울림(FIRE)»일 때뿐이다 — 미룸 · 없음이면 이번 읽기는 안 누른다.
     */
    fun gate(f: GateFacts): Gate {
        val handHeld = f.tapsList && !f.openedByApp && f.hasBest && f.handBlocks
        var openBlocked: String? = if (f.tapsList && f.hasBest && f.openedByApp) OpenBlocked.BUSY else null
        if (handHeld) openBlocked = OpenBlocked.HAND_FIRST
        var heldRecheck = false
        var holdFires = false
        if (f.tapsList && !f.openedByApp) {
            when (f.hold) {
                AlarmHold.Kind.HOLD -> {
                    if (!handHeld) openBlocked = OpenBlocked.ALARM_HELD
                    heldRecheck = true
                }
                AlarmHold.Kind.FIRE -> holdFires = true
                AlarmHold.Kind.NONE, null -> Unit
            }
        }
        var evaluatingStop = false
        var planTap = false
        if (f.tapsList && !f.openedByApp && f.hasBest && holdFires) {
            if (f.evaluating()) {
                openBlocked = OpenBlocked.EVALUATING
                evaluatingStop = true
            } else {
                planTap = !handHeld
            }
        }
        return Gate(openBlocked, handHeld, heldRecheck, evaluatingStop, planTap)
    }

    /** 🌊 배차망이 누를 자리를 못 정했다 — 방금 스크롤이면 흐르는 목록(곧 다시 읽음), 아니면 배차망이 남긴 보류 까닭(없으면 HELD) */
    fun afterPlan(scrolledRecently: Boolean, pluginHoldKey: String?): String =
        if (scrolledRecently) OpenBlocked.LIST_MOVING else pluginHoldKey ?: OpenBlocked.HELD

    /**
     * 📬 넘겨받은 쪽이 쏘기 전에 다시 본다 — 멈출 까닭(로그 글 · `OpenBlocked` 키) 또는 null(쏜다).
     * 차례가 뜻이다: 목록 아님 → 이미 누르는 중 → 손 먼저 → 심사 중 → 요금 칸 못 읽음 → 목록이 움직임.
     */
    fun recheckStop(
        onList: Boolean,
        busy: Boolean,
        handBlocks: Boolean,
        handWhy: String,
        evaluating: () -> Boolean,
        scanY: Int,
        nowY: Int?,
        scrolledRecently: Boolean,
    ): Pair<String, String>? = when {
        !onList -> "목록이 아니다" to OpenBlocked.TAP_RECHECK
        busy -> "이미 누르는 중" to OpenBlocked.BUSY
        handBlocks -> "손 먼저(넘기는 사이 처리된 손 흔적 · $handWhy)" to OpenBlocked.HAND_FIRST
        evaluating() -> "앞 콜 심사 중(넘기는 사이 결재 대기)" to OpenBlocked.EVALUATING
        nowY == null -> "요금 칸을 다시 못 읽었다" to OpenBlocked.TAP_RECHECK
        TapShift.listMoving(scanY, nowY, scrolledRecently) -> "목록이 움직이는 중(스캔 Y=$scanY · 지금 Y=$nowY)" to OpenBlocked.LIST_MOVING
        else -> null
    }
}
