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

    /** 적요 상세 팝업 판별 */
    val memoKeywords: List<String>,

    /** 에러 팝업 판별 */
    val errorKeywords: List<String>,

    /** 로딩 화면 (감지 시 무시) */
    val loadingKeywords: List<String>
)

