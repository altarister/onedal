package com.onedal.app.core

/**
 * ✋ **기사님이 손으로 잡았다 — 공통 한 곳** (91판 S09 · 71 «가» · `HandAcceptTest`).
 * 원달앱이 연 미리보기(또는 보고 보류 콜)의 «수락 전 상세»에서 «수락하면 배차망이 스스로 보내는 페이지»(표의 landsAfterAccept —
 * 화물24시 배차내역 목록)로 넘어가면 기사님이 수락하신 것이다. 사실은 페이지 표 한 곳 · 배차망 이름으로 가르지 않는다.
 * 인성(확정 뒤 상세 · InsungSequence)과 픽커(KakaoPickerPlugin.onScreenChanged)는 아직 따로 알아본다 — 같은 뜻의 길이 셋(다음 정리 거리).
 */
object HandAccept {
    fun of(prevPage: ScreenSpec?, nowPage: ScreenSpec?, wasPreview: Boolean, heldUnfilled: Boolean): Boolean =
        (wasPreview || heldUnfilled) && prevPage?.standard == StandardScreen.DETAIL_PRE_CONFIRM && nowPage?.landsAfterAccept == true
}
