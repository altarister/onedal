package com.onedal.app.plugins.kakaopicker

import com.onedal.app.core.OcrLine
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * 📸 **실물 라이브 09-30 12:52·12:54 — 한 글자 오독에 좋은 콜을 놓쳤다** (실서버 이상 기록 id 33·34).
 * - id 34: 요금이 «최종 수익 11,249» 꼴이라 0원 · «16:55까지 배송»이 «16:55가지 배송»으로 읽혀 하차 건물 이름이 됐다
 * - id 33: «픽업 14.7가km» — 숫자와 km 사이 한 글자에 픽업 머리를 못 찾았다(배송 머리는 있었다)
 * 줄 글자는 이상 기록 원문 그대로다. 행정동 줄은 기록에 잘려 없어 같은 꼴로 채웠다.
 */
class PickerLiveMisreadTest {

    @Test fun `최종 수익 꼴도 요금이다 - 목록 대조 P390 과 같은 규칙`() {
        assertEquals(11249, PickerDetailOcrParser.extractFareFromTexts(listOf("최종 수익 11,249", "넘기기", "수락하기")))
        assertEquals(15000, PickerDetailOcrParser.extractFareFromTexts(listOf("배송비 15,000원")))
    }

    @Test fun `id34 - 까지 오독 시각 줄은 건물 이름이 아니다`() {
        val lines = listOf(
            OcrLine(100, "서울 송파구 마천1동"), OcrLine(100, "픽업 5.5km"),
            OcrLine(140, "동명상회"), OcrLine(140, "16:10까지 픽업"),
            OcrLine(200, "서울 용산구 이촌1동"), OcrLine(200, "배송 16.7km"),
            OcrLine(240, "16:55가지 배송"),
        )
        val d = PickerScreenOcr.parseDetail(lines)!!
        assertEquals("동명상회", d.pickup.place)
        assertNull("시각 줄은 장소가 아니다", d.dropoff.place)
        assertEquals("16:55까지", d.dropoff.at)
    }

    @Test fun `id33 - 픽업 14점7가km 도 머리다`() {
        val lines = listOf(
            OcrLine(113, "픽업 14.7가km"), OcrLine(150, "경기 성남시 분당구 정자동"),
            OcrLine(206, "배송 21.4km"), OcrLine(240, "서울 강남구 역삼동"), OcrLine(260, "17:42까지 배송"),
        )
        val d = PickerScreenOcr.parseDetail(lines)
        assertNotNull(d)
        assertEquals(14.7, d!!.pickup.straightKm, 0.0)
    }

    @Test fun `머리가 없으면 없는 쪽을 이름으로`() {
        val noPickup = listOf(OcrLine(113, "픽업 14.7가가km"), OcrLine(206, "배송 21.4km"))
        assertEquals("픽업 머리 없음", PickerDetailOcrParser().failureReason(noPickup))
        assertEquals("픽업·배송 머리 없음", PickerDetailOcrParser().failureReason(listOf(OcrLine(1, "지도"))))
    }
}
