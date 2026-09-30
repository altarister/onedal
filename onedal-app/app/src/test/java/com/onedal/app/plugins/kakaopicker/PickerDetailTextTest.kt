package com.onedal.app.plugins.kakaopicker

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Test

/**
 * 🧹 **상세 글은 «픽업지» 노드부터** — 상세 시트가 목록 위로 올라오는 첫 틀에 목록 글자가 남아 서버로 갔다
 * (라이브 09-30 19:28:59 «오더카드 대기 중»의 «대기»가 제외 키워드에 걸려 거짓 빨강 · onedal-1f «가»).
 * 글은 서버 intel PICKER_DETAIL 13230 · 12165 원문이다. «픽업지…»로 시작하는 노드는 트레이스와 같은 한 노드이고,
 * 그 앞 노드 경계는 원문 띄어쓰기로 나눈 추정이다(노드 목록 원본은 안 남는다).
 */
class PickerDetailTextTest {
    private val detail = listOf("픽업지 경기 성남시 수정구 복정동", "물품 정보", "소형 세 변의 합 100cm ∙ 5kg 이하", "유의사항", "파손 주의해주세요", "넘기기", "수락하기")

    @Test fun `목록 잔상을 뗀다 - 13230 오더카드 대기 중`() {
        val raw = listOf("퀵", "14.2km", "퀵", "15.0km", "퀵", "승", "예약", "내일", "14.0km", "분당", "분당", "분당", "삼평", "7,630", "퀵", "오더카드 대기 중...") + detail
        val out = KakaoPickerParser.detailTextsOf(raw)
        assertEquals(detail, out)
        assertFalse(out.joinToString(" ").contains("대기"))
    }

    @Test fun `목록 잔상을 뗀다 - 12165 이런 일거리 어떤가요`() {
        val tail = listOf("픽업지 경기 광주시 경안동 람미당", "물품 정보", "중형 세 변의 합 140cm ∙ 20kg 이하", "유의사항", "바로 배송가주실 분만 잡아주세요", "넘기기", "수락하기")
        val raw = listOf("퀵", "4.7km", "이런 일거리 어떤가요?", "물류·포장·상하차", "무신사", "단기/장기 · 09:30~18:30", "일급 11만원", "퀵", "오더카드 대기 중...") + tail
        assertEquals(tail, KakaoPickerParser.detailTextsOf(raw))
    }

    @Test fun `깨끗한 틀은 그대로`() = assertEquals(detail, KakaoPickerParser.detailTextsOf(detail))

    @Test fun `픽업지 노드가 없는 상세(도보 등)는 그대로`() {
        val walk = listOf("도보", "픽업 준비 14분 남음", "[태전점]롯데리아", "배송지: 쌍용 스윗닷홈아파트", "넘기기", "수락하기")
        assertEquals(walk, KakaoPickerParser.detailTextsOf(walk))
    }
}
