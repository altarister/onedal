package com.onedal.app.plugins.insung

import com.onedal.app.core.ScreenKeywords
import com.onedal.app.core.engine.PopupFill

object InsungKeywords {
    /** 인성콜 전용 키워드 */
    val INSUNG = ScreenKeywords(
        listRequired = listOf("신규", "빠른설정"),  // 둘 다 있어야 신규 리스트 (완료 탭에는 빠른설정 없음)
        completedListRequired = listOf("완료", "신규"),  // "완료" + "신규" 둘 다 있고 "빠른설정"은 없으면 완료 리스트
        detailKeywords = listOf("적요상세", "요금"),
        confirmKeywords = listOf("확정", "배차"),
        pickupKeywords = listOf("출발지 상세", "상차지 상세"),
        dropoffKeywords = listOf("도착지 상세", "하차지 상세"),
        memoKeywords = listOf("적요 상세", "적요 내용"), // 팝업 타이틀"적요 상세"(띄어쓰기) + 본문 헤더"적요 내용" → 확정화면("적요상세" 붙여쓰기)과 구분
        errorKeywords = listOf("취소할 수 없", "시간이 지나", "실패"),
        loadingKeywords = listOf("오더 조회", "기다려 주십"),
        appLabel = "인성콜",
        cancelKeyword = "취소"
    )

    /**
     * 🖥️ **이 배차망 화면에만 있는 글자 묶음** — 스캔앱이 화면 글자로 배차망을 가를 때 쓴다
     * (기사님 확정 · `TargetApp.networksOnScreen`). 묶음 안 글자가 **전부** 보여야 이 배차망이다.
     * 🔴 새로 적지 않는다 — 위 화면 판별 글자에서 만든다 (두 곳에 적으면 갈라진다 · 규칙 ③).
     */
    val NETWORK_MARKERS: List<List<String>> = listOf(INSUNG.listRequired, INSUNG.detailKeywords)

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
    )
}
