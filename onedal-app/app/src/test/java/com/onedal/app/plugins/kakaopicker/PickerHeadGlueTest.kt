package com.onedal.app.plugins.kakaopicker

import com.onedal.app.core.OcrLine
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * 📸 **실물 09-30 13:23:49 (#41·#43) — «찍업 12.7km» 이 행정동 줄에 붙어 한 줄로** · 13:25:23 (#44) — 하차 건물 자리에 «물품 정보».
 * «업» 앞 한 글자 오독은 픽업 머리로 본다 — 뒤에 숫자·km 가 붙을 때만(«작업»·«영업» 낱말은 아니다).
 * 머리가 붙은 행정동 줄은 머리 앞까지가 주소다. 제목 줄(물품 정보·유의사항·최종 수익·배송비·프로모션·픽업 장소)은 장소가 아니다.
 * #41 의 하차 행정동 줄은 기록에 잘려 그 콜의 목록 줄(용산 한남)로 채웠다.
 */
class PickerHeadGlueTest {
    private val line41 = OcrLine(110, "경기 성남시 중원구 상대원1동 찍업 12.7km")

    @Test fun `찍업 머리가 행정동 줄에 붙어 와도 찾고 주소는 머리 앞까지`() {
        val d = PickerScreenOcr.parseDetail(listOf(line41, OcrLine(160, "서울 용산구 한남동"), OcrLine(167, "배송 19.1km")))!!
        assertEquals("경기 성남시 중원구 상대원1동", d.pickup.admin)
        assertEquals(12.7, d.pickup.straightKm, 0.0)
        assertEquals(emptyList<String>(), PickerScreenOcr.missingHeads(listOf(line41, OcrLine(167, "배송 19.1km"))))
    }

    @Test fun `작업 영업 낱말은 머리가 아니다 - 숫자 km 가 붙어야 한다`() =
        assertEquals(listOf("픽업"), PickerScreenOcr.missingHeads(listOf(OcrLine(1, "영업시간 10:00"), OcrLine(2, "작업 지시"), OcrLine(3, "배송 1.0km"))))

    @Test fun `44 - 제목 줄은 하차 건물이 아니다`() {
        val d = PickerScreenOcr.parseDetail(listOf(
            OcrLine(100, "경기 성남시 분당구 이매2동"), OcrLine(100, "픽업 15.7km"),
            OcrLine(200, "서울 강남구 논현2동"), OcrLine(200, "배송 14.0km"), OcrLine(230, "18:54까지 배송"),
            OcrLine(330, "물품 정보"), OcrLine(330, "중형 세 변의 합 140cm · 20kg 이하"),
        ))!!
        assertNull(d.dropoff.place)
    }
}
