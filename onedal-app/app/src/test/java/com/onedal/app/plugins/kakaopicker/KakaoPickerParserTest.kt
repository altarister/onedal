package com.onedal.app.plugins.kakaopicker

import com.onedal.app.models.FilterTally
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * 🌐 픽커 파서 채점 — **문제지는 실물 화면 덤프다** (2026-08-30).
 *
 * 카드 텍스트는 전부 `log/카카오픽커/화면덤프/`(08-28)와 `화면덤프_0830/`(08-30 · 실계정)
 * 에서 좌표 정렬(top→left) 순서 그대로 옮겼다 — 지어낸 카드가 아니다.
 * 배차망이 리뉴얼되면: 새 덤프를 뜨고 이 문제지와 대조한다 (리뉴얼 대비 관행 1호).
 *
 * ⚠️ parse() 는 android 클래스를 안 쓰므로 JVM 에서 그대로 돈다.
 *    카드 묶기(rect)는 순수 함수 둘(isFareAnchor·inCardBand)로 검사한다 —
 *    인성 RowGroupingTest 와 같은 방식이다.
 */
class KakaoPickerParserTest {

    // 유닛 테스트에는 Context 가 없다 — 파서가 Context 를 안 쓰는 것이 계약이다
    private val parser = KakaoPickerParser(null)

    @Test
    fun `0830 실계정 카드 - 준비 완료 태그, 같은 동네 단거리`() {
        // (50,927)퀵 (128)단거리 (257)준비 완료 (370)소형 (524)광주 → (981,961)2,529 → (92,991)4.7km 광주 경안 경안
        val texts = listOf("퀵", "단거리", "준비 완료", "소형", "광주", "2,529", "4.7km", "광주", "경안", "경안")
        val o = parser.parse(texts)
        assertEquals(2529, o.fare)
        assertEquals("광주 경안", o.pickup)
        assertEquals("광주 경안", o.dropoff)
        assertEquals(4.7, o.pickupDistance!!, 0.01)
        assertEquals("소형", o.itemSize)
        assertTrue(o.tagsText!!.contains("준비 완료"))
        assertNull(o.deliveryDistance)   // 픽커 리스트에는 배송거리가 없다 — 지어내지 않는다
        assertNull(o.vehicleType)        // 차종 칸에 물품 크기를 섞어 싣지 않는다
    }

    @Test
    fun `0830 실계정 카드 - 분당 야탑에서 이매로`() {
        val texts = listOf("퀵", "단거리", "준비 29분", "소형", "분당", "6,400", "14.9km", "분당", "야탑1", "이매1")
        val o = parser.parse(texts)
        assertEquals(6400, o.fare)
        assertEquals("분당 야탑1", o.pickup)
        assertEquals("분당 이매1", o.dropoff)
        assertTrue(o.tagsText!!.contains("준비 29분"))
    }

    @Test
    fun `0828 카드 - 예약 콜은 시각이 딴 노드로 온다`() {
        // (188,927)예약 (272,926)17:00 — 예약 표식과 시각이 두 노드다
        val texts = listOf("퀵", "소형", "예약", "17:00", "수지", "14,168", "15.2km", "중원", "성남", "동천")
        val o = parser.parse(texts)
        assertEquals(14168, o.fare)
        assertEquals("중원 성남", o.pickup)    // 성남시 중원구 성남동 — 구·동 표기
        assertEquals("수지 동천", o.dropoff)
        assertEquals("17:00", o.scheduleText)
    }

    @Test
    fun `수집 전용 - 절대 잡지 않되, 평가는 했다고 센다`() {
        // 잡기·알람 없음 (1차 확정). tally.seen 을 올려야 지문 기억이 콜당 한 번만 보고 조용해진다 (#79)
        val o = parser.parse(listOf("퀵", "소형", "광주", "3,000", "1.0km", "광주", "경안", "경안"))
        val tally = FilterTally()
        assertFalse(parser.shouldClick(o, tally))
        assertEquals(1, tally.seen)
    }

    @Test
    fun `0830 실계정 카드 - 반나절·승 태그를 지역으로 오인하지 않는다 (첫 수집에서 잡은 실사고)`() {
        // 첫 실수집에서 pickup="반나절 승" 으로 저장됐던 그 카드 (덤프 04_리스트_예약카드 y926~991)
        val texts = listOf("퀵", "반나절", "승", "강동", "14,466", "19.6km", "하남", "신장2", "천호3")
        val o = parser.parse(texts)
        assertEquals(14466, o.fare)
        assertEquals("하남 신장2", o.pickup)
        assertEquals("강동 천호3", o.dropoff)
        assertTrue(o.tagsText!!.contains("반나절"))
        assertTrue(o.tagsText!!.contains("승"))
        assertNull(o.itemSize)   // 반나절 카드에는 물품 크기 표시가 없다 — 지어내지 않는다
    }

    @Test
    fun `0830 실수집 - 하단 메뉴 낱말이 맨 아래 카드에 섞여도 지역으로 오인하지 않는다`() {
        // 실수집에서 pickup="카드설정 수요지도" 로 저장됐던 그 모양
        val texts = listOf("퀵", "단거리", "준비 완료", "소형", "중원", "3,000", "14.2km", "중원", "금광2", "중원", "카드설정", "수요지도")
        val o = parser.parse(texts)
        assertEquals("중원 금광2", o.pickup)
        assertEquals("중원 중원", o.dropoff)
    }

    @Test
    fun `요금 닻 판별 - 오른쪽 정렬 쉼표 숫자만`() {
        assertTrue(KakaoPickerParser.isFareAnchor("2,529", 981))
        assertTrue(KakaoPickerParser.isFareAnchor("14,168", 965))
        assertFalse(KakaoPickerParser.isFareAnchor("2,529", 105))     // 왼쪽이면 요금이 아니다
        assertFalse(KakaoPickerParser.isFareAnchor("4.7km", 981))     // 거리
        assertFalse(KakaoPickerParser.isFareAnchor("17:00", 981))     // 예약 시각
        assertFalse(KakaoPickerParser.isFareAnchor("20km", 615))      // 헤더의 노출 반경
    }

    @Test
    fun `카드 띠 판별 - 요금 중심 ±60이 한 카드다 (실측 줄 간격 ±35, 다음 카드 ±163)`() {
        assertTrue(KakaoPickerParser.inCardBand(961, 927))    // 태그줄
        assertTrue(KakaoPickerParser.inCardBand(961, 991))    // 지역줄
        assertFalse(KakaoPickerParser.inCardBand(961, 1090))  // 다음 카드 태그줄
        assertFalse(KakaoPickerParser.inCardBand(961, 795))   // 헤더
    }
}
