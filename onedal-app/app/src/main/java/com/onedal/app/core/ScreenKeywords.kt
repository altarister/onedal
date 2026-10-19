package com.onedal.app.core

/**
 * 배차망 이름표 — 단추 글자는 배차망 정의 표의 `buttons`(`buttonsOn`)에 있다.
 * 🔴 화면을 알아보는 글자는 여기 두지 않는다 — 배차망 정의 표(shared `networkPages.ts` → `…Pages.screens`)에만 있고,
 *    판별은 `ScreenDetector` 가 그 표를 읽는다.
 */
data class ScreenKeywords(
    /** 앱 이름 라벨 (로깅용) */
    val appLabel: String = "배차앱",
)
