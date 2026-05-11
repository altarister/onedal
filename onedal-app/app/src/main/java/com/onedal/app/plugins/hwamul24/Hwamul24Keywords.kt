package com.onedal.app.plugins.hwamul24

import com.onedal.app.core.ScreenKeywords

object Hwamul24Keywords {
    /**
     * 화물24시(전국24시콜화물) 전용 키워드 사전
     *
     * 스크린샷 분석 결과를 바탕으로 화면 판별에 사용하는 고유 키워드를 정의합니다.
     * - 리스트 화면: "화물정보" 헤더 + "자동새로고침" 토글이 동시에 존재
     * - 상세 화면: "화물상세정보" 헤더가 존재
     * - 확정 전: "배차신청" 또는 "전화걸기" 버튼이 존재
     * - 확정 후: "배차내역" 헤더가 존재 (배차 완료 내역 화면)
     */
    val TWENTYFOUR = ScreenKeywords(
        // 신규 리스트 판별 — "화물정보" + "자동새로고침"이 동시에 있으면 실시간 콜 리스트
        listRequired = listOf("화물정보", "자동새로고침"),

        // 완료 리스트 판별 — "배차내역" + "화물정보"가 동시에 있으면 완료 콜 리스트
        completedListRequired = listOf("배차내역", "화물정보"),

        // 상세(적요) 페이지 판별 — "화물상세정보"가 있으면 오더 상세 화면
        detailKeywords = listOf("화물상세정보", "운송료"),

        // 배차 전/후 구분 — "배차신청" 또는 "전화걸기" 버튼이 있으면 아직 배차 전
        confirmKeywords = listOf("배차신청", "전화걸기"),

        // 출발지 팝업 판별 — 화물24시는 별도 출발지 팝업이 없으나, 상세 화면에 상차지 정보 표시
        pickupKeywords = listOf("상차지", "상차 주소"),

        // 도착지 팝업 판별 — 화물24시는 별도 도착지 팝업이 없으나, 상세 화면에 하차지 정보 표시
        dropoffKeywords = listOf("하차지", "하차 주소"),

        // 적요 상세 팝업 판별 — 화물24시는 리스트에 적요가 바로 노출되므로 별도 팝업 없음
        // (호환성을 위해 상세 화면의 화물정보 라벨로 대체)
        memoKeywords = listOf("화물정보", "적요"),

        // 에러 팝업 판별 — 배차 실패/시간 초과 등
        errorKeywords = listOf("이미 배차", "배차할 수 없", "시간이 지나", "실패"),

        // 로딩 화면 (감지 시 무시) — 자동터치 동의 팝업 포함
        loadingKeywords = listOf("자동터치 사용시", "동의하십니까"),

        appLabel = "화물24시",
        cancelKeyword = "돌아가기"
    )
}
