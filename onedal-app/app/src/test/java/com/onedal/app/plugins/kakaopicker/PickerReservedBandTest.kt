package com.onedal.app.plugins.kakaopicker

import com.onedal.app.core.OcrLine
import com.onedal.app.models.SimplifiedOfficeOrder
import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * 📅 **예약 날은 «픽업예약» 띠 줄이 먼저** — 픽업 줄은 «17:00까지 픽업»(날 없음)이라 픽업 줄만 보면 «날 모름»으로 오늘 콜을 막았다.
 */
class PickerReservedBandTest {
    private fun reservationOf(lines: List<OcrLine>, card: SimplifiedOfficeOrder) =
        (PickerDetailOcrParser().verify(PickerScreenOcr.parseDetail(lines)!!, card, null, emptyList(), "") as PickerDetailOcrParser.VerifyResult.Success)
            .order.let { Triple(it.reserved, it.reservedDay, it.reservedAt) }

    /**
     * 실물 09-30 14:21:40 사진 ok_1790745697317.jpg — «오늘» 띠가 든 이상 기록이 없어 줄의 y 는 사진 픽셀 자리를 옮겨 적었다.
     */
    @Test fun `띠 줄 오늘 17시 - 픽업 줄이 까지 꼴이어도 오늘`() {
        val lines = listOf(
            OcrLine(43, "퀵 승용차 예약"), OcrLine(104, "오늘 17:00 픽업예약"),
            OcrLine(207, "경기 성남시 분당구 이매2동"), OcrLine(203, "픽업 15.7km"), OcrLine(230, "17:00까지 픽업"),
            OcrLine(264, "서울 강남구 논현2동"), OcrLine(259, "배송 14.0km"), OcrLine(286, "18:54까지 배송"),
            OcrLine(364, "물품 정보"), OcrLine(366, "중형 세 변의 합 140cm · 20kg 이하"), OcrLine(442, "유의사항"), OcrLine(443, "대박스 1개"),
            OcrLine(581, "넘기기"), OcrLine(581, "수락하기"),
        )
        val card = SimplifiedOfficeOrder(id = "c", pickup = "분당 이매2", dropoff = "강남 논현2", fare = 15246, timestamp = "t")
        assertEquals(Triple(true, 0, "17:00"), reservationOf(lines, card))
    }

    /** 실물 09-30 16:18:06 — 서버 이상 기록 512 의 사진 16줄 그대로 */
    @Test fun `띠 줄 내일 12시 20분 - 이상 기록 512`() {
        val lines = listOf(
            OcrLine(30, "퀵 반나절 승용차 예약"), OcrLine(193, "서울 송파구 문정2동"), OcrLine(235, "와인마트 문정점"),
            OcrLine(286, "경기 하남시 감북동"), OcrLine(326, "드까르멜릿"), OcrLine(428, "물품 정보"), OcrLine(90, "내일 12:20 픽업예약"),
            OcrLine(509, "유의사항"), OcrLine(192, "픽업 19.6km"), OcrLine(221, "내일 12:20"), OcrLine(565, "넘기기"),
            OcrLine(285, "배송 4.5km"), OcrLine(312, "내일 14:56"), OcrLine(429, "중형 세 변의 합 140cm. 20kg 이하"),
            OcrLine(510, "와인 12병 입니다. 부피가 크니 가능한"), OcrLine(567, "수락하기"),
        )
        val card = SimplifiedOfficeOrder(id = "c", pickup = "송파 문정2", dropoff = "하남 감북", fare = 7238, timestamp = "t")
        assertEquals(Triple(true, 1, "12:20"), reservationOf(lines, card))
    }
}
