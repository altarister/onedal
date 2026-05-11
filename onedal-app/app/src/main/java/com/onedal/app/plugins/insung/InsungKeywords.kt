package com.onedal.app.plugins.insung

import com.onedal.app.core.ScreenKeywords

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
}
