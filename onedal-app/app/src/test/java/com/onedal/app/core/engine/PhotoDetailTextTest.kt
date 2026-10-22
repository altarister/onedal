package com.onedal.app.core.engine

import com.onedal.app.core.OcrLine
import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * 📸 **판독 줄은 `[사진]` 머리표 뒤에 위에서 아래로** (57 3단계) — 서버 읽는 법(공통 문제지 pageReadCases.json 의 [사진] 줄)이 이 모양을 전제한다.
 * 못 잡는 것: 사진 길이 실제로 이 글을 보내는지(PreConfirmSequence — 폰 · 서버 원문 intel rawDetailText 에 «[사진]»).
 */
class PhotoDetailTextTest {
    @Test
    fun `접근성 글 뒤에 머리표 · 판독 줄은 y 순서`() {
        val text = PhotoDetailText.of("픽업지 경기 성남시 수정구 신촌동 넘기기 수락하기",
            listOf(OcrLine(300, "18:28까지 배송"), OcrLine(100, "퀵 비즈"), OcrLine(250, "서울 광진구 자양2동 배송 9.7km")))
        assertEquals("픽업지 경기 성남시 수정구 신촌동 넘기기 수락하기\n[사진]\n퀵 비즈\n서울 광진구 자양2동 배송 9.7km\n18:28까지 배송", text)
    }

    @Test
    fun `판독 줄이 없으면 접근성 글 그대로`() {
        assertEquals("가나다", PhotoDetailText.of("가나다", emptyList()))
    }
}
