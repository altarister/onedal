package com.onedal.app.core

/**
 * 배차 앱별 화면 판별 키워드 사전
 *
 * 각 배차 앱(인성콜, 24시 등)의 화면을 구분하는 고유 키워드를 한 곳에서 관리합니다.
 * 새로운 앱을 추가할 때는 이 파일에 새 object를 만들기만 하면 됩니다.
 */
data class ScreenKeywords(
    /** 신규 리스트 판별 — 이 키워드들이 전부 있으면 신규 콜 리스트 */
    val listRequired: List<String>,

    /** 완료 리스트 판별 — 이 키워드들이 전부 있으면 완료 리스트 */
    val completedListRequired: List<String>,

    /** 상세(적요) 페이지 판별 */
    val detailKeywords: List<String>,

    /** 배차 전/후 구분 — 이 키워드가 있으면 "배차 전" */
    val confirmKeywords: List<String>,

    /** 출발지 팝업 판별 */
    val pickupKeywords: List<String>,

    /** 도착지 팝업 판별 */
    val dropoffKeywords: List<String>,

    /** 에러 팝업 판별 */
    val errorKeywords: List<String>,

    /** 로딩 화면 (감지 시 무시) */
    val loadingKeywords: List<String>
)

object AppKeywords {

    /** 인성콜 전용 키워드 */
    val INSUNG = ScreenKeywords(
        listRequired = listOf("신규", "빠른설정"),  // 둘 다 있어야 신규 리스트 (완료 탭에는 빠른설정 없음)
        completedListRequired = listOf("완료", "신규"),  // "완료" + "신규" 둘 다 있고 "빠른설정"은 없으면 완료 리스트
        detailKeywords = listOf("적요상세", "요금"),
        confirmKeywords = listOf("확정", "배차"),
        pickupKeywords = listOf("출발지 상세", "상차지 상세"),
        dropoffKeywords = listOf("도착지 상세", "하차지 상세"),
        errorKeywords = listOf("취소할 수 없", "시간이 지나", "실패"),
        loadingKeywords = listOf("오더 조회", "기다려 주십")
    )

    /** 24시콜 전용 키워드 (향후 실제 앱 분석 후 채워넣기) */
    val TWENTYFOUR = ScreenKeywords(
        listRequired = listOf("TODO"),
        completedListRequired = listOf("TODO"),
        detailKeywords = listOf("TODO"),
        confirmKeywords = listOf("TODO"),
        pickupKeywords = listOf("TODO"),
        dropoffKeywords = listOf("TODO"),
        errorKeywords = listOf("TODO"),
        loadingKeywords = listOf("TODO")
    )
}
