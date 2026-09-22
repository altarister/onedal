package com.onedal.app.plugins.kakaopicker

import com.onedal.app.core.OcrLine
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * 📷 **픽커 상세를 그림으로 읽는다 — 실측 한 판을 통째로 문다**.
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

    @Test
    fun `동 대조는 마지막 토막(동)을 엄격 검증하여 같은 구 이웃 동 오판을 막는다`() {
        // 정상 일치
        assertTrue(PickerDetailOcrParser.matchDong("분당 야탑3", "경기 성남시 분당구 야탑3동"))
        assertTrue(PickerDetailOcrParser.matchDong("광주 광남1", "경기 광주시 광남1동"))
        assertTrue(PickerDetailOcrParser.matchDong("성남 상대원", "경기 성남시 중원구 상대원동"))
        assertTrue(PickerDetailOcrParser.matchDong("강남 역삼동", "서울 강남구 역삼2동"))

        // 같은 구 내의 다른 동 끼어들기 방어 (분당 야탑3 vs 분당구 이매1동) -> 실패해야 정상!
        assertFalse(PickerDetailOcrParser.matchDong("분당 야탑3", "경기 성남시 분당구 이매1동"))
        assertFalse(PickerDetailOcrParser.matchDong("강남 역삼동", "서울 강남구 논현동"))
    }

    @Test
    fun `화면 텍스트에서 픽커 요금을 추출한다`() {
        assertEquals(9693, PickerDetailOcrParser.extractFareFromTexts(listOf("접수완료", "9,693P", "포인트 적립")))
        assertEquals(15000, PickerDetailOcrParser.extractFareFromTexts(listOf("배송비 15,000원", "수락하기")))
        assertEquals(0, PickerDetailOcrParser.extractFareFromTexts(listOf("픽업 10km", "배송 20km")))
    }

    /**
     * 📷 **머리가 줄 **가운데**에 오는 판** — 실측 실패 (이상 기록 #46·#48·#39).
     *
     * 픽커 상세에는 모양이 둘이다. 하나는 「픽업 2.2km」가 줄 처음에 오고, 다른 하나는
     * **주소 뒤에** 붙는다. 정규식이 `^` 로 줄 처음만 봐서 뒤 모양을 통째로 놓쳤다 —
     * 사진에 배송지가 또렷이 찍혀 있는데 「머리 둘 누락」으로 버렸다.
     *
     * 🔴 «먼저 나오는 것 하나만» 이라는 지도 라벨 방어는 그대로다 — `^` 가 그 방어가 아니었다.
     */
    private val 실물_곤지암_신둔면 = listOf(
        OcrLine(40, "뒤로가기"),
        OcrLine(70, "아래 창 올리기"),
        OcrLine(110, "퀵 배송"),
        OcrLine(150, "224분 남음"),
        OcrLine(180, "준비 19분 포함"),
        OcrLine(240, "경기 광주시 초월읍 모다아울렛 곤지암점 픽업 2.2km 17:48까지 픽업"),
        OcrLine(300, "경기 이천시 신둔면 신둔농협하나로마트 예스파크점 배송 10.0km 20:47까지 배송"),
        OcrLine(360, "픽업 장소 매장 직원에게 문의"),
        OcrLine(400, "오더번호 260919170258396"),
        OcrLine(440, "물품 정보 중형"),
        OcrLine(480, "최종 수익 10,000 P"),
        OcrLine(510, "배송비 10,000P"),
        OcrLine(560, "넘기기"),
        OcrLine(600, "수락하기"),
    )

    @Test
    fun `머리가 주소 뒤에 와도 읽는다 — 줄 처음만 보지 않는다`() {
        val r = PickerScreenOcr.parseDetail(실물_곤지암_신둔면)
        assertNotNull("사진에 배송지가 있는데 «머리 둘 누락»으로 버렸다 (이상 기록 #46·#48·#39)", r)
        assertEquals(2.2, r!!.pickup.straightKm, 0.01)
        assertEquals(10.0, r.dropoff.straightKm, 0.01)
    }

    @Test
    fun `지도 라벨과 안 섞인다 — 먼저 나오는 머리 하나씩만 본다`() {
        val 지도라벨섞임 = listOf(OcrLine(90, "배송"), OcrLine(160, "픽업")) + 실물_곤지암_신둔면
        val r = PickerScreenOcr.parseDetail(지도라벨섞임)
        assertNotNull(r)
        assertEquals(2.2, r!!.pickup.straightKm, 0.01)
    }
}
