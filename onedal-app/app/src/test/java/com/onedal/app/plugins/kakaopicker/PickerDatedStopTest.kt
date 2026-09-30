package com.onedal.app.plugins.kakaopicker

import com.onedal.app.core.OcrLine
import com.onedal.app.models.SimplifiedOfficeOrder
import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * 📅 **날짜가 붙은 정류장 시각 · 읍·면 목록 줄** — 실물 09-30 16:03:36 손으로 연 상세(서버 이상 기록 511 · 사진 15줄 그대로).
 * - 정류장 옆 «10/02(금) 09:00»을 시각으로 못 알아봐 건물 이름 자리에 넣었다 → 주소 «…모현읍 10/02(금) 09:00» → 서버 좌표 실패(16:03:59 같은 꼴)
 * - 목록 줄 «처인 모현»과 사진 «모현읍»을 같은 곳으로 안 봐 요금을 못 가져왔다(«상차 맞음 0» → 요금 없음)
 */
class PickerDatedStopTest {
    private val lines = listOf(
        OcrLine(30, "퀵승용차 예약"), OcrLine(93, "0 10/2(금) 09:00 픽업예약"),
        OcrLine(190, "경기 용인시 처인구 모현읍"), OcrLine(233, "아인라이크"),
        OcrLine(284, "경기 용인시 수지구 죽전3동"), OcrLine(328, "도담마을힐스테이트4차1 단지아"), OcrLine(365, "파트"),
        OcrLine(465, "물품 정보"), OcrLine(192, "픽업 8.4km"), OcrLine(222, "10/02(금) 09:00"), OcrLine(567, "넘기기"),
        OcrLine(285, "배송 11.3km"), OcrLine(315, "10/02(금) 10:18"), OcrLine(466, "소형 세 변의 합 100cm. 5kg 이하"), OcrLine(567, "수락하기"),
    )
    private val listCard = SimplifiedOfficeOrder(id = "c", pickup = "처인 모현", dropoff = "수지 죽전3", fare = 13013, timestamp = "t", pickupDistance = 8.4)

    @Test fun `날짜가 붙은 시각은 정류장 시각이다 - 건물 이름 자리에 안 들어간다`() {
        val d = PickerScreenOcr.parseDetail(lines)!!
        assertEquals("경기 용인시 처인구 모현읍", d.pickup.admin)
        assertEquals("아인라이크", d.pickup.place)
        assertEquals("10/02(금) 09:00", d.pickup.at)
        assertEquals("도담마을힐스테이트4차1 단지아", d.dropoff.place)
    }

    @Test fun `읍 면도 목록 줄 열쇠로 - 사진으로 목록 줄을 찾아 요금을 가져온다`() {
        val d = PickerScreenOcr.parseDetail(lines)!!
        assertEquals(13013, KakaoPickerParser.photoMatchCard(d.pickup, d.dropoff, listOf(listCard))?.fare)
        val m = KakaoPickerParser.matchListCard(listOf("픽업지 경기 용인시 처인구 모현읍 아인라이크", "물품 정보", "소형", "넘기기", "수락하기"), listOf(listCard))
        assertEquals(13013, m.card?.fare)
    }

    @Test fun `띠 줄의 날짜를 예약으로 읽는다 - 손으로 연 상세도 판정 콜에 싣는다`() {
        val d = PickerScreenOcr.parseDetail(lines)!!
        val r = PickerDetailOcrParser().verify(d, null, null, emptyList(), "", listOf(listCard)) as PickerDetailOcrParser.VerifyResult.Success
        val today = java.time.LocalDate.now()
        val expected = java.time.temporal.ChronoUnit.DAYS.between(today, java.time.LocalDate.of(if (today.monthValue > 10) today.year + 1 else today.year, 10, 2)).toInt()
        assertEquals(true, r.order.reserved)
        assertEquals(expected, r.order.reservedDay)
        assertEquals("09:00", r.order.reservedAt)
        assertEquals(13013, r.order.fare)
        assertEquals("경기 용인시 처인구 모현읍 아인라이크", r.order.pickup)
    }
}

/**
 * 💰 **요금 줄은 건물 이름이 아니다** — 실물 09-30 16:11:12 손으로 연 상세(사진 ok_1790752273336.jpg).
 * 하차(문정2동)에 건물 줄이 없어, 하차 칸 아래를 차례로 보다 «12,628 P»(최종 수익 값)를 건물로 골라 서버에 «…문정2동 12,628 P»로 갔다.
 * 줄의 y 는 그 사진의 픽셀 자리를 옮겨 적은 것이다(판독기 원출력은 성공 때 안 남는다).
 */
class PickerStopPlaceTest {
    private val lines = listOf(
        OcrLine(40, "퀵 승용차 예약"), OcrLine(104, "10/2(금) 15:50 픽업예약"),
        OcrLine(207, "경기 성남시 분당구 운중동"), OcrLine(203, "픽업 18.8km"), OcrLine(231, "10/02(금) 15:50"), OcrLine(245, "꽃담은시루"),
        OcrLine(298, "서울 송파구 문정2동"), OcrLine(295, "배송 10.6km"), OcrLine(324, "10/02(금) 17:14"),
        OcrLine(403, "물품 정보"), OcrLine(404, "소형 세 변의 합 100cm · 5kg 이하"),
        OcrLine(503, "최종 수익"), OcrLine(503, "12,628 P"),
        OcrLine(581, "넘기기"), OcrLine(581, "수락하기"),
    )

    @Test fun `건물이 없는 하차 - 요금 줄을 건물로 고르지 않는다`() {
        val d = PickerScreenOcr.parseDetail(lines)!!
        assertEquals("꽃담은시루", d.pickup.place)
        assertEquals(null, d.dropoff.place)
        assertEquals("10/02(금) 17:14", d.dropoff.at)
        assertEquals(12628, d.finalIncome)
    }

    @Test fun `건물이 없는 하차 - 제목 줄 아래 유의사항 글도 건물이 아니다`() {
        val withNote = lines.filter { it.y < 500 } + listOf(OcrLine(470, "유의사항"), OcrLine(471, "케이크입니다. 파손주의 부탁드립니다."))
        assertEquals(null, PickerScreenOcr.parseDetail(withNote)!!.dropoff.place)
    }
}
