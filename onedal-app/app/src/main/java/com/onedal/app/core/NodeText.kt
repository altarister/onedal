package com.onedal.app.core

/**
 * 🧹 **화면 노드 글자 한 칸을 읽는 규칙 — 파싱으로 가는 두 길(`gatherNodeTexts` · `extractAllTextNodes`)이 같이 쓴다** (`NodeTextTest`).
 * 픽커 상세 «픽업지 …» 노드는 끝에 «kotlin.Unit»을 달고 온다 — 픽커 앱 자체 글자다(실물 덤프 09-30 13:40 content-desc).
 * 건물 이름에 띄어쓰기 없이 붙어 오기도 해서(«지엔코빌딩kotlin.Unit») 낱말이 아니라 글자로 뗀다.
 */
object NodeText {
    private const val PICKER_NOISE = "kotlin.Unit"

    /** 앞뒤 공백·픽커 잡음 글자를 뗀 글자 · 남는 것이 없으면 null(모으지 않는다) */
    fun clean(raw: CharSequence?): String? =
        raw?.toString()?.replace(PICKER_NOISE, "")?.trim()?.takeIf { it.isNotEmpty() }
}
