package com.onedal.app.core.engine

import com.onedal.app.core.OcrLine

/**
 * 📸 **서버로 가는 상세 글 = 접근성 글 + `[사진]` 머리표 + 판독 줄(위에서 아래로)** (57 3단계).
 * 실물 픽커는 하차 줄 · «HH:MM까지 배송» · 거리를 접근성으로 안 내놓는다 — 판독 줄에만 있다(실물 10-22 16:51 콜).
 * 칸 나누기는 서버가 배차망 정의 표 읽는 법으로 한다(같은 칸이 둘이면 앞의 접근성 값이 먼저 — 표 읽는 법이 첫 일치를 쓴다).
 * 인성이 팝업 글을 머리표 붙여 잇는 것과 같은 모양이다 — 배차망 이름으로 가르지 않는다.
 */
object PhotoDetailText {
    const val MARK = "[사진]"

    fun of(screen: String, lines: List<OcrLine>): String =
        if (lines.isEmpty()) screen
        else screen + "\n" + MARK + "\n" + lines.sortedBy { it.y }.joinToString("\n") { it.text }
}
