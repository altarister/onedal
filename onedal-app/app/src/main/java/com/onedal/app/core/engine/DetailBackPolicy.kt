package com.onedal.app.core.engine

import com.onedal.app.models.ScreenContext

/**
 * ⏱️ **상세 대기 — 걸까 · 시간이 되면 뒤로 갈까 · 결재가 오면 풀까** (29 사실 ① · ② · 31 P0 A1 · A3 · A4).
 * 서비스 안 세 자리의 식을 그대로 옮긴 값 함수 — 기다림 걸기 · 뒤로 가기 · 로그는 부르는 쪽이 한다.
 */
object DetailBackPolicy {
    /** 상세에 들어오면 대기를 건다 — 세 배차망 모두 · 누가 진입시켰든 원달앱이 계약하지 않는 콜(29 P3 — 계약하는 콜은 결재를 기다린다) */
    fun arms(contractedByApp: Boolean): Boolean = !contractedByApp

    /** 대기 시간이 되면 — 아직 확정 전 상세이고 원달앱이 계약하지 않는 콜일 때만 뒤로 간다(모드 · 배차망 · 연 쪽은 안 본다) */
    fun fires(screen: ScreenContext, contractedByApp: Boolean): Boolean =
        screen == ScreenContext.DETAIL_PRE_CONFIRM && !contractedByApp

    /** 결재가 오면 대기를 푼다 — 기사님이 손으로 연 상세만(판정을 보고 기사님이 누르신다) · 원달앱이 연 콜은 결재 갈래가 정한다 */
    fun stopsOnDecision(openedByApp: Boolean): Boolean = !openedByApp
}
