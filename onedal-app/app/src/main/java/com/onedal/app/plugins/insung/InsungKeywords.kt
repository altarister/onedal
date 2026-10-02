package com.onedal.app.plugins.insung

import com.onedal.app.core.ScreenKeywords
import com.onedal.app.core.engine.PopupFill

object InsungKeywords {
    /** 인성콜 이름표 · 취소 버튼 글자 — 화면을 알아보는 글자는 배차망 정의 표(`InsungPages.screens`)에 있다 */
    val INSUNG = ScreenKeywords(appLabel = "인성콜", cancelKeyword = "취소")

    /**
     * 🖥️ **이 배차망 화면에만 있는 글자 묶음** — 스캔앱이 화면 글자로 배차망을 가를 때 쓴다
     * (기사님 확정 · `TargetApp.networksOnScreen`). 묶음 안 글자가 **전부** 보여야 이 배차망이다.
     * 🔴 **일부러 표와 따로 둔다** — 표의 페이지 글자를 그대로 쓰면 «완료 + 신규» 같은 묶음이 픽커 화면에도 맞아 배차망을 잘못 가른다.
     *    표에서 고르는 일은 reviews/35 4단계에서 한다. 목록 · 상세 글자와 같은 값이다(`NetworkByScreenTest`).
     */
    val NETWORK_MARKERS: List<List<String>> = listOf(listOf("신규", "빠른설정"), listOf("적요상세", "요금"))

    /**
     * 🏄 **인성 팝업 3장으로 채우는 글자** — 누를 버튼과 «다 떴다»를 알아보는 글자 (배차망_모드표.md 순서 ③).
     * 팝업 수집기(`DetailCollectMachine`)는 공통이고 글자는 여기에만 있다.
     */
    val POPUP_FILL = PopupFill(
        memoButton = "적요상세",
        pickupButtons = listOf("출발지", "상차"),
        dropoffButtons = listOf("도착지", "하차"),
        closeButton = "닫기",
        memoReady = listOf("적요 내용"),
        pickupReady = listOf("전화1", "도착지 상세"),
        dropoffReady = listOf("전화1"),
        memoHeader = "[적요상세/정보]",
        pickupHeader = "[출발지상세]",
        dropoffHeader = "[도착지상세]",
    )
}
