package com.onedal.app.core

/**
 * 🚧 **통과 콜이 있는데 앱이 안 연 까닭 — 열쇠 하나** (목록 보고 openBlocked · onedal-ab 안 · 1f «가» · `BundleGuardsTest`).
 * 관제웹 띠가 «목록이 내려감»이 아니라 이 까닭을 따라간다. 열었거나 통과 콜이 없거나 누르는 모드가 아니면(알람 꺼짐 등) 안 싣는다.
 */
object OpenBlocked {
    /** 기사님 손이 움직인 뒤 1.5초 — 손이 멈추면 곧 연다 (`HandFirst`) */
    const val HAND_FIRST = "handFirst"
    /** 목록이 그려지는 중(내용 바뀜이 몰림) — 다음 읽기에서 같은 조립이면 연다 (`AlarmHold`) */
    const val ALARM_HELD = "alarmHeld"
    /** 서버가 앞 콜을 심사 중 — 결재가 나면 곧 연다 (`EvaluatingNow`) */
    const val EVALUATING = "evaluating"
    /** 앱이 이미 다른 콜 상세를 처리 중 */
    const val BUSY = "busy"
    /** 목록이 흐르는 중(누르기 직전 줄이 움직였거나 방금 스크롤) — 멈추면 곧 다시 읽어 연다 (`TapShift.listMoving`) */
    const val LIST_MOVING = "listMoving"
    /** 화면에 오더카드 꼴(«수락» · «숫자 P»)이 보인다 — 누르면 계약이라 안 연다 */
    const val ACCEPT_VISIBLE = "acceptVisible"
    /** 머리줄(«리스트 설정») 아래가 아니다 — 오더카드 자리일 수 있다(#111) */
    const val NOT_UNDER_HEADER = "notUnderHeader"
    /** 내려간 목록인데 «오더카드 대기 중» 띠가 없거나 대기 중이 아니다 */
    const val NO_WAITING_BAND = "noWaitingBand"
    /** 내려간 목록에서 띠 바로 아래 줄 */
    const val UNDER_BAND = "underBand"
    /** 아래 탭 줄에 걸린 맨 아래 줄 — 목록이 올라오면 연다 (`TapShift.rowTapDy`) */
    const val TAB_BAR = "tabBar"
    /** 찍기 직전 다시 재니 조건이 깨졌다(요금 칸을 못 다시 읽음 · 머리줄 아래가 아님) */
    const val TAP_RECHECK = "tapRecheck"
    /** 내려간 목록 누르기가 꺼져 있다 (`KakaoPickerPlugin.SCROLLED_LIST_TAP`) */
    const val SCROLLED_OFF = "scrolledOff"
    /** 누르기를 못 보냈다(노드 사라짐 · 같은 누름 진행 중) */
    const val TAP_NOT_SENT = "tapNotSent"
    /** 배차망이 까닭 없이 보류 */
    const val HELD = "held"
}
