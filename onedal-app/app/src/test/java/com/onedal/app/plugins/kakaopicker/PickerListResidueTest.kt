package com.onedal.app.plugins.kakaopicker

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * 🩹 **상세 시트가 목록 위로 올라오는 찰나, 목록 글자가 섞인다** — 실물 09-30 09:43:47 (상세로 판별된 판에 목록 광고 글자).
 * 목록의 «상세 잔상»(`isDetailResidue`)과 거꾸로다 — 이 판의 글자는 상세 페이지로 통째로 모으지 않는다(광고가 바뀔 때마다 «새 글자»가 된다).
 */
class PickerListResidueTest {
    @Test fun `목록 광고·오더카드 대기 글자가 섞인 상세 판은 목록 잔상이다`() {
        val mixed = listOf("퀵", "4.7km", "이런 일거리 어떤가요?", "정기배송·운전", "무신사 안성물류센터 알바", "일급",
            "퀵 오더카드 대기 중...", "물품 직접 전달할게요", "넘기기")
        assertTrue(KakaoPickerParser.isListResidue(mixed))
        assertTrue(KakaoPickerParser.isListResidue(listOf("리스트 설정", "픽업지")))
    }

    @Test fun `깨끗한 상세 판은 잔상이 아니다`() {
        val detail = listOf("픽업지", "경기 광주시 경안동 람미당kotlin.Unit", "물품 정보", "중형 세 변의 합 140cm ∙ 20kg 이하",
            "유의사항", "바로 배송가주실 분만 잡아주세요", "넘기기", "수락하기")
        assertFalse(KakaoPickerParser.isListResidue(detail))
    }
}
