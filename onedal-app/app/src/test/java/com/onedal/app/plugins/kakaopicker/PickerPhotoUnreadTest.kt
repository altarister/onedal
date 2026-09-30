package com.onedal.app.plugins.kakaopicker

import com.onedal.app.core.OcrLine
import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * 📰 **상세 사진에서 칸에 안 넣은 줄도 버리지 않는다** — 실물 09-30 08:04 예약 콜 사진(ok_1790723257644)의 줄 그대로.
 * 유의사항 · 꼬리표 · 버튼 줄이 «정의에 없음»으로 모인다 — 픽커가 상세를 바꾸면 여기서 먼저 보인다 (reviews/24 D4).
 */
class PickerPhotoUnreadTest {
    @Test fun `칸에 안 넣은 사진 줄이 남는다`() {
        val lines = listOf(
            OcrLine(100, "퀵"), OcrLine(100, "반나절"), OcrLine(100, "예약"),
            OcrLine(160, "내일 14:00 픽업예약"),
            OcrLine(230, "경기 광주시 경안동"), OcrLine(230, "픽업 4.7km"),
            OcrLine(270, "람미당"), OcrLine(270, "내일 14:00"),
            OcrLine(330, "서울 용산구 한남동"), OcrLine(330, "배송 26.4km"),
            OcrLine(370, "아라마크"), OcrLine(370, "내일 17:49"),
            OcrLine(450, "물품 정보"), OcrLine(450, "중형 세 변의 합 140cm · 20kg 이하"),
            OcrLine(510, "유의사항"), OcrLine(510, "바로 배송가주실 분만 잡아주세요"),
            OcrLine(580, "넘기기"), OcrLine(580, "수락하기"),
        )
        val parsed = PickerScreenOcr.parseDetail(lines)!!
        assertEquals("경기 광주시 경안동", parsed.pickup.admin)
        assertEquals(listOf("퀵", "반나절", "예약", "물품 정보", "유의사항", "바로 배송가주실 분만 잡아주세요", "넘기기", "수락하기"),
            parsed.unreadLines)
    }
}
