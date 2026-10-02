package com.onedal.app.core

/**
 * 배차망 이름표와 취소 버튼 글자.
 * 🔴 화면을 알아보는 글자는 여기 두지 않는다 — 배차망 정의 표(shared `networkPages.ts` → `…Pages.screens`)에만 있고,
 *    판별은 `ScreenDetector` 가 그 표를 읽는다(reviews/35 2단계).
 */
data class ScreenKeywords(
    /** 앱 이름 라벨 (로깅용) */
    val appLabel: String = "배차앱",

    /** 취소/돌아가기 버튼 키워드 */
    val cancelKeyword: String = "취소"
)
