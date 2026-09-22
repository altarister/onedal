package com.onedal.app.core

/**
 * 👈 **찍는 자리를 왼쪽으로 옮긴다** (기사님 지시).
 *
 * 리스트 카드의 닻은 **요금 글자**(화면 오른쪽)이고, 상세 화면의 **«수락하기»도 오른쪽 아래**에 있다.
 * 화면이 상세로 바뀌는 찰나에 그 좌표를 찍으면 **곧 계약**이 된다.
 *
 * 카드 한 줄은 전체가 눌리므로 **같은 줄에서 왼쪽으로 옮겨** 찍어도 상세로 똑같이 들어간다.
 * 그리고 화면이 먼저 바뀌어 잘못 눌려도 그 자리는 «넘기기»(계약이 아니라 콜을 넘기는 것)다.
 *
 * 🔴 화면 왼쪽 밖으로 나가지 않게 최소 x 를 지킨다 — 나가면 아무 데도 안 눌려 알람이 조용히 죽는다.
 * 순수 계산이라 폰 없이 검사된다 (`TapShiftTest`).
 */
object TapShift {
    /** 화면 왼쪽 여백 — 이보다 왼쪽은 찍지 않는다 (폰 픽셀) */
    const val MIN_X = 24

    /**
     * 픽커 리스트 카드에서 요금 닻으로부터 왼쪽으로 옮기는 거리 (폰 픽셀 · 실물 1080px 화면 기준).
     * 실물 리스트에서 요금은 오른쪽 끝(x≈980)이고, 300px 왼쪽이면 지역 글자 자리라 **같은 카드 안**이다.
     */
    const val PICKER_LIST_LEFT_PX = 300

    fun leftOf(centerX: Int, shiftPx: Int): Int = maxOf(MIN_X, centerX - shiftPx)

    /** 카드 줄의 왼쪽 끝에서 안쪽으로 이만큼 들어와 찍는다 — 테두리·여백을 피한다 */
    const val ROW_INSET_PX = 40

    /**
     * 👈 **그 줄의 왼쪽 끝을 찍는다** (기사님 지시 — «금액에서 -300px 말고 그 라인의 왼쪽 끝»).
     * 요금에서 일정 거리를 빼는 방식은 카드 폭에 따라 여전히 오른쪽에 남는다 —
     * 줄의 왼쪽 끝은 «수락하기»(오른쪽 아래)에서 **가장 먼 자리**라 화면이 바뀌어도 그 자리가 아니다.
     */
    fun rowLeftOf(rowLeft: Int): Int = maxOf(MIN_X, rowLeft + ROW_INSET_PX)

    /**
     * ⏳ **자국을 보여 주고 이만큼 미뤘다 찍는다 — 지금은 0, 바로 찍는다** (기사님 지시).
     *
     * 한때 1초를 미뤘다. 그런데 폰이 바쁘면 예약이 몇 초씩 밀려 **자국이 사라진 한참 뒤에** 눌렸고,
     * 미루는 사이에 목록이 바뀌는 위험까지 생겼다. 자국은 찍은 **뒤에도** 남아 있어서
     * 미루지 않아도 «무엇을 눌렀나»가 보인다 — 기다릴 까닭이 없다.
     *
     * 🔴 0 보다 크게 되돌리면 미루는 길이 다시 돌고, 그 길의 방어(`sameSpot` · `wokeTooLate`)도
     *    함께 살아난다. 기다림이 있으면 그 둘이 반드시 필요하다.
     */
    const val PREVIEW_MS = 0L

    /** 미룬 사이 이만큼까지 움직인 것은 같은 자리로 본다 (폰 픽셀 · 손가락 끝 굵기) */
    const val MOVE_TOL_PX = 24

    /** 예약한 때보다 이만큼까지 늦게 깨어난 것은 봐준다 — 조금 늦었다고 알람을 죽이지 않는다 */
    /** 🔒 미뤄 둔 찍기의 잠금이 스스로 풀리기까지 주는 여유 — 콜백이 유실돼도 영영 안 찍히지 않게 */
    const val PENDING_GRACE_MS = 500L

    /**
     * 🔒 **미뤄 둔 찍기가 있어 이번 찍기를 건너뛸 것인가.**
     *
     * 막으려는 것은 «**미뤄 둔 예약이 둘 쌓이는 것**» 하나다 — 화면 읽기가 1초마다 도는 탓에
     * 미루는 사이 다음 읽기가 또 알람을 울리면 예약이 쌓이고, 둘째가 뒤늦게 발사되면
     * 상세 화면 위를 찍는다 (알람은 «한 번에 요금 최고 하나» · 규칙 ①·④).
     *
     * 🔴 **바로 찍는 길(`delayMs <= 0`)은 절대 막지 않는다.** 앱이 팝업을 차례로 열고 닫는 길은
     *    0.2~0.4초 간격으로 연달아 눌러야 한다 — 거기까지 막으면 「닫기」가 삼켜져 팝업이 안 닫히고
     *    순회가 처음부터 되풀이된다 (`TapShiftTest` · 인성 적요·출발지·도착지 셋 돌기).
     *
     * @param pendingAtMs 미뤄 둔 찍기를 건 시각(부팅 기준) · 0 이면 없음
     * @param nowMs 지금(부팅 기준)
     * @param delayMs 이번 찍기를 얼마나 미루나 (0 이면 바로 찍는다 — 그 길은 안 막는다)
     */
    fun blockedByPending(pendingAtMs: Long, nowMs: Long, delayMs: Long): Boolean =
        delayMs > 0L && pendingAtMs > 0L && nowMs - pendingAtMs < delayMs + PENDING_GRACE_MS

    const val LATE_TOL_MS = 2_000L

    /**
     * 🐢 **너무 늦게 깨어났나 — 그러면 쏘지 않는다** (기사님 지시).
     *
     * 폰이 바쁘면 예약한 일이 제때 안 깨어난다. 원달앱은 예전부터 그것을 `🐢 [발사 지연]` 으로
     * 적어 왔고(«300ms 뒤로 예약했는데 7,191ms 만에 깨어났다»), 안드로이드 쪽이라 고칠 수 없다.
     * 1초 미뤄 찍기로 잡았는데 7초 뒤에 쏘면 **그사이 목록이 바뀌어 다른 카드를 찍는다.**
     * 자리 다시 재기(`sameSpot`)가 한 겹 막지만, 우연히 같은 자리면 못 가린다.
     * 🔴 늦었으면 **다음 판에 다시** 한다 — 알람 한 번을 미루는 값이 오배차보다 싸다 (규칙 ④).
     */
    fun wokeTooLate(plannedDelayMs: Long, actualElapsedMs: Long): Boolean =
        actualElapsedMs > plannedDelayMs + LATE_TOL_MS

    /**
     * 🔴 **미룬 뒤에는 자리를 다시 재고, 그대로일 때만 쏜다.**
     * 미룬 사이에 리스트가 갱신되면 «잰 자리»에 다른 카드가 와 있다 — 그게 09-13 오배차의 모양이다.
     * 다시 못 쟀으면(노드가 사라졌으면) 안 쏜다 (규칙 ④ — 모르면 손대지 않는다).
     */
    fun sameSpot(oldX: Int, oldY: Int, newX: Int?, newY: Int?): Boolean {
        if (newX == null || newY == null) return false
        return kotlin.math.abs(newX - oldX) <= MOVE_TOL_PX && kotlin.math.abs(newY - oldY) <= MOVE_TOL_PX
    }
}
