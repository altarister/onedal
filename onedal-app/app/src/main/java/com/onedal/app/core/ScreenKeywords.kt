package com.onedal.app.core

/**
 * 배차망 이름표와 취소 버튼 글자.
 * 🔴 화면을 알아보는 글자는 여기 두지 않는다 — 배차망 정의 표(shared `networkPages.ts` → `…Pages.screens`)에만 있고,
 *    판별은 `ScreenDetector` 가 그 표를 읽는다.
 */
data class ScreenKeywords(
    /** 앱 이름 라벨 (로깅용) */
    val appLabel: String = "배차앱",

    /** 취소/돌아가기 버튼 키워드 — 잡기 전 상세에서 물러나는 단추 */
    val cancelKeyword: String = "취소",

    /** 🛡️ 잡은 뒤 결재 CANCEL 로 누를 단추(안전취소) — 없으면 못 누름(계약이 남음 · `DecisionWord`) */
    val contractCancelButton: String? = null,

    /** 🛡️ 잡은 뒤 결재 KEEP 으로 누를 단추 — 없으면 누를 것 없음(수락하면 곧바로 목록으로 가는 배차망) */
    val contractCloseButton: String? = null,
)
