package com.onedal.app.core

import com.onedal.app.core.engine.ScreenDetector

/**
 * 🏁 **«먼저 가져감» 이상 기록 — 공통** (reviews/35 3 · 4단계).
 * 알림(토스트)이 배차망 정의 표의 알림(NOTICE) 덧칸에 맞으면 «다른 기사가 먼저 가져갔다»로 보고, 운영센터 «이상 기록»의 까닭 글을 만든다.
 * 어느 앱의 알림을 믿나는 플러그인 칸 `noticeSources` 가 정한다 — 여기에는 배차망 글자가 없다.
 */
object CallTakenNote {
    /** 그 배차망 표의 알림 덧칸 중 글자가 맞는 것 — 없으면 null */
    fun noticeOf(screens: List<ScreenSpec>, text: String): OverlaySpec? {
        val detector = ScreenDetector()
        return screens.flatMap { it.overlays }.firstOrNull { it.kind == OverlayKind.NOTICE && detector.hits(it.match, text) }
    }

    /**
     * 🧾 까닭 글 — 운영센터 «이상 기록»의 «까닭» 칸에 그대로 뜬다(`PickerTakenToastTest` 가 09:48 · 09:53 원문으로 잠근다).
     * @param tappedPage 누른 화면(배차망 페이지 이름) · @param notifiedPage 알림이 왔을 때의 화면 — 모르면 null
     */
    fun reason(notice: OverlaySpec, tappedPage: String?, notifiedPage: String?, foundToTap: String, firstSeen: String): String =
        "CALL_TAKEN: ${notice.name} — ${notice.meaning} · 누른 화면: ${tappedPage ?: "모름"} · 알림 때 화면: ${notifiedPage ?: "표에 없음"} · " +
            "발견→누름 $foundToTap · 처음 보인 때 $firstSeen"
}
