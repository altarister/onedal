package com.onedal.app.plugins.kakaopicker

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * 📷 **픽커 상세를 그림으로 읽는다 — 실측 한 판을 통째로 문다** (2026-09-13).
 *
 * 문제지는 서버 검사 `onedal-web/server/tests/core/pickerScreenOcr.test.ts` 와 **같은 것**이다 —
 * 기사님 A24 에서 찍어 540px·JPEG60 으로 줄인 뒤 macOS Vision 이 낸 출력 그대로
 * (`ex_images/카카오픽커/실물_20260913_내가찍음/33_…_보낼크기.jpg`). 오타(`세 변의`→`세 번의`)까지 그대로다.
 *
 * 🔴 두 벌(서버 ts · 앱 kt)이 같은 규칙인지는 이 문제지가 지킨다. 한쪽만 고치면 여기서 갈린다.
 */
class PickerScreenOcrTest {

    private val 실물_위례_삼성2동 = listOf(
        OcrLine(20, "4:16 799 0"),                      // 상태바 시계 — 시각처럼 생긴 잡음
        OcrLine(92, "배송"),                             // 지도 위 말풍선
        OcrLine(161, "픽업"),
        OcrLine(257, "9광주"),                           // 지도 라벨(헛읽음)
        OcrLine(257, "•과천"),
        OcrLine(274, "0성남"),
        OcrLine(309, "간양"),
        OcrLine(379, "8워요"),
        OcrLine(488, "• 내일 15:00 픽업예약"),
        OcrLine(574, "픽업 16.9km"),
        OcrLine(577, "• 경기 성남시 수정구 위례동"),
        OcrLine(598, "내일 15:00"),
        OcrLine(611, "위례역푸르지오4단지아파트"),
        OcrLine(651, "배송 10.1km"),
        OcrLine(657, "• 서울 강남구 삼성2동"),
        OcrLine(675, "내일 16:40"),
        OcrLine(690, "더에스엠씨그룹"),
        OcrLine(774, "물품 정보"),
        OcrLine(777, "초소형 세 번의 합 70cm 2kg 이하"),
        OcrLine(842, "유의사항"),
        OcrLine(844, "흐트러질 수 있으니, 파손"),
        OcrLine(901, "남기기"),                          // 「넘기기」를 헛읽은 것
        OcrLine(901, "수락하기"),
    )

    @Test
    fun `배송지가 나온다 - 접근성 트리에는 한 글자도 없던 것`() {
        val r = PickerScreenOcr.parseDetail(실물_위례_삼성2동)!!
        assertEquals("서울 강남구 삼성2동", r.dropoff.admin)
        assertEquals("더에스엠씨그룹", r.dropoff.place)
    }

    @Test
    fun `픽업지는 kotlin Unit 없이 성하게 나온다`() {
        val r = PickerScreenOcr.parseDetail(실물_위례_삼성2동)!!
        assertEquals("경기 성남시 수정구 위례동", r.pickup.admin)
        assertEquals("위례역푸르지오4단지아파트", r.pickup.place)
        assertFalse(r.pickup.place!!.contains("kotlin"))
    }

    @Test
    fun `거리는 픽업 배송 둘이고 직선이다`() {
        val r = PickerScreenOcr.parseDetail(실물_위례_삼성2동)!!
        assertEquals(16.9, r.pickup.straightKm, 0.0001)
        assertEquals(10.1, r.dropoff.straightKm, 0.0001)
    }

    @Test
    fun `예약 콜과 그 시각을 읽는다 - 지금 콜이 아니다`() {
        val r = PickerScreenOcr.parseDetail(실물_위례_삼성2동)!!
        assertTrue(r.reserved)
        assertEquals("내일 15:00", r.pickup.at)
        assertEquals("내일 16:40", r.dropoff.at)
    }

    @Test
    fun `물품 크기는 화면 줄 그대로 싣는다`() {
        val r = PickerScreenOcr.parseDetail(실물_위례_삼성2동)!!
        assertEquals("초소형 세 번의 합 70cm 2kg 이하", r.itemSize)
    }

    @Test
    fun `지도 위 지명이 주소로 새지 않는다`() {
        val r = PickerScreenOcr.parseDetail(실물_위례_삼성2동)!!
        for (잡음 in listOf("과천", "성남시 분당", "광주", "안양")) {
            assertNotEquals(잡음, r.pickup.place)
            assertNotEquals(잡음, r.dropoff.place)
        }
        assertTrue(r.pickup.admin.startsWith("경기 "))
        assertTrue(r.dropoff.admin.startsWith("서울 "))
    }

    @Test
    fun `상세가 아니면 null 이다 - 반쪽 콜을 만들지 않는다`() {
        val 홈화면 = listOf(
            OcrLine(163, "기사님이 관심있는"),
            OcrLine(508, "우리동네 이마트배송하고"),
            OcrLine(534, "시간당 최대 27,000원 벌기"),
            OcrLine(741, "퀵 1건 배송완료하고"),
        )
        assertNull(PickerScreenOcr.parseDetail(홈화면))
    }

    @Test
    fun `머리가 하나만 있으면 null 이다 - 반쯤 스크롤된 화면`() {
        val 반쪽 = listOf(
            OcrLine(574, "픽업 16.9km"),
            OcrLine(577, "경기 성남시 수정구 위례동"),
            OcrLine(611, "위례역푸르지오4단지아파트"),
        )
        assertNull(PickerScreenOcr.parseDetail(반쪽))
    }

    @Test
    fun `행정동이 머리보다 몇 px 위에 찍혀도 읽는다`() {
        val 뒤집힘 = listOf(
            OcrLine(571, "• 경기 성남시 수정구 위례동"),   // 머리보다 3px 위
            OcrLine(574, "픽업 16.9km"),
            OcrLine(598, "내일 15:00"),
            OcrLine(611, "위례역푸르지오4단지아파트"),
            OcrLine(648, "• 서울 강남구 삼성2동"),        // 머리보다 3px 위
            OcrLine(651, "배송 10.1km"),
            OcrLine(690, "더에스엠씨그룹"),
        )
        val r = PickerScreenOcr.parseDetail(뒤집힘)
        assertNotNull(r)
        assertEquals("경기 성남시 수정구 위례동", r!!.pickup.admin)
        assertEquals("서울 강남구 삼성2동", r.dropoff.admin)
        assertEquals("더에스엠씨그룹", r.dropoff.place)
    }

    @Test
    fun `건물명이 없으면 null 로 둔다 - 지어내지 않는다`() {
        val 건물없음 = listOf(
            OcrLine(574, "픽업 16.9km"),
            OcrLine(577, "경기 성남시 수정구 위례동"),
            OcrLine(598, "내일 15:00"),
            OcrLine(651, "배송 10.1km"),
            OcrLine(657, "서울 강남구 삼성2동"),
            OcrLine(690, "더에스엠씨그룹"),
        )
        val r = PickerScreenOcr.parseDetail(건물없음)!!
        assertNull(r.pickup.place)
        assertEquals("더에스엠씨그룹", r.dropoff.place)
    }

    /**
     * 🔬 실측 2 — 2026-09-19 A24 · 폰 안 ML Kit 출력 그대로 (아래 60% 를 540폭으로 자른 판).
     *    오늘 콜이라 시각이 「10:00까지 픽업」·「12:39까지 배송」 줄로 온다. 첫 판에서는 이 줄이
     *    시각으로 안 잡혀 건물명 자리에 「10:00까지 픽업」이 들어가고 시각은 null 이었다.
     */
    private val 실물_광남1동_남한산성면 = listOf(
        OcrLine(31, "퀵 반나절 예약"),
        OcrLine(94, "오늘 10:00 픽업예약"),
        OcrLine(190, "픽업 5.0km"),
        OcrLine(193, "경기 광주시 광남1동"),
        OcrLine(222, "10:00까지 픽업"),
        OcrLine(235, "온미"),
        OcrLine(283, "경기 광주시 남한산성면"),
        OcrLine(285, "배송 10.8km"),
        OcrLine(315, "12:39까지 배송"),
        OcrLine(328, "산성달숨"),                      // 상호를 헛읽은 것 — 그대로 둔다
        OcrLine(428, "물품 정보"),
        OcrLine(429, "중형 세 변의 합 140cm. 20kg 이하"),
        OcrLine(565, "넘기기"),
        OcrLine(567, "수락하기"),
    )

    @Test
    fun `오늘 콜의 HH MM까지 픽업 줄은 시각이고 건물명 자리에 새지 않는다`() {
        val r = PickerScreenOcr.parseDetail(실물_광남1동_남한산성면)
        assertNotNull(r)
        assertEquals("경기 광주시 광남1동", r!!.pickup.admin)
        assertEquals("10:00까지", r.pickup.at)
        assertEquals("온미", r.pickup.place)
        assertEquals("경기 광주시 남한산성면", r.dropoff.admin)
        assertEquals("12:39까지", r.dropoff.at)
        assertEquals("산성달숨", r.dropoff.place)
        assertEquals(5.0, r.pickup.straightKm, 0.0001)
        assertEquals(10.8, r.dropoff.straightKm, 0.0001)
        assertTrue(r.reserved)
        assertEquals("중형 세 변의 합 140cm. 20kg 이하", r.itemSize)
    }
}
