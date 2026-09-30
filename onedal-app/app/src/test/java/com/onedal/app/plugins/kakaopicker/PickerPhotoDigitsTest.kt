package com.onedal.app.plugins.kakaopicker

import com.onedal.app.core.OcrLine
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Test

/**
 * 📸 **실물 09-30 13:14:38 (이상 기록 id 38) — 머리 km 의 0 이 영문 O 로 읽혔다** «배송 19.Okm».
 * 머리 숫자 토막 안에서만 O/o→0 · l/I→1 로 바꾼다 — 건물 이름 등 다른 글자는 그대로.
 * 같은 사진에 «최종 수익»(y448)과 «11,796»(y447)이 다른 줄로 갈라져 있다 — 높이가 같은 줄끼리 이어 요금으로 읽는다.
 * 줄은 이상 기록 원문 그대로다.
 */
class PickerPhotoDigitsTest {
    private val id38 = listOf(
        OcrLine(32, "퀵 반나절"), OcrLine(112, "경기 성남시 분당구 삼평동"), OcrLine(156, "아이스크림연수원"),
        OcrLine(206, "서울 관악구 보라매동"), OcrLine(247, "대교타워"), OcrLine(349, "물품 정보"),
        OcrLine(448, "최종 수익"), OcrLine(512, "배송비"), OcrLine(113, "픽업 16.7가km"), OcrLine(567, "넘기기"),
        OcrLine(206, "배송 19.Okm"), OcrLine(236, "17:34까지 배송"), OcrLine(349, "초소형 세 변의 합 70cm . 2kg 이하"),
        OcrLine(447, "11,796"), OcrLine(513, "11,396P"), OcrLine(564, "수락하기"),
    )

    @Test fun `머리 숫자 안의 O 는 0`() {
        assertEquals("배송 19.0km", PickerScreenOcr.normalizeHeadDigits("배송 19.Okm"))
        assertEquals("픽업 1.2km", PickerScreenOcr.normalizeHeadDigits("픽업 l.2km"))
        assertEquals("올영 이천터미널점", PickerScreenOcr.normalizeHeadDigits("올영 이천터미널점"))
    }

    @Test fun `id38 - 두 머리를 찾고 배송 19점0`() {
        val d = PickerScreenOcr.parseDetail(id38)
        assertNotNull(d)
        assertEquals(19.0, d!!.dropoff.straightKm, 0.0)
        assertEquals(16.7, d.pickup.straightKm, 0.0)
    }

    @Test fun `id38 - 최종 수익은 같은 높이의 숫자 줄`() {
        assertEquals(11796, PickerScreenOcr.parseDetail(id38)!!.finalIncome)
    }
}
