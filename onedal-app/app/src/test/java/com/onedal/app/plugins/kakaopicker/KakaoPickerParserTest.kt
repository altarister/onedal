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
    fun `알람 판정 - 요금 하한·상차 반경·도착지 세 축이다`() {
        val good = parser.parse(listOf("퀵", "반나절", "승", "강동", "14,466", "19.6km", "하남", "신장2", "천호3"))
        // 반경 20km 면 통과 → 알람 대상
        val t1 = FilterTally()
        assertTrue(KakaoPickerParser.decide(good, 10000, 20, tally = t1))
        assertEquals(1, t1.passed)
        // 같은 콜도 반경 15km 면 픽업거리 축에서 떨어진다
        val t2 = FilterTally()
        assertFalse(KakaoPickerParser.decide(good, 10000, 15, tally = t2))
        assertEquals(1, t2.pickup)
        // 요금 미달은 요금 축
        val cheap = parser.parse(listOf("퀵", "소형", "광주", "3,000", "1.0km", "광주", "경안", "경안"))
        val t3 = FilterTally()
        assertFalse(KakaoPickerParser.decide(cheap, 10000, 20, tally = t3))
        assertEquals(1, t3.fare)
    }

    @Test
    fun `알람 판정 - 도착지 축은 국면의 도착목표를 재사용한다 (기사님 확정 0830)`() {
        // 도착 «강동 천호3» — 도착목표가 성남·분당이면 방향이 달라 안 울린다
        val good = parser.parse(listOf("퀵", "반나절", "승", "강동", "14,466", "19.6km", "하남", "신장2", "천호3"))
        val t1 = FilterTally()
        assertFalse(KakaoPickerParser.decide(good, 10000, 20, listOf("성남", "분당"), emptyMap(), tally = t1))
        assertEquals(1, t1.region)
        // 도착목표에 강동이 있으면 울린다
        assertTrue(KakaoPickerParser.decide(good, 10000, 20, listOf("강동", "송파"), emptyMap()))
        // 도착목표가 비어 있으면(관내 등) 제한 없음 — 지금까지의 동작 그대로
        assertTrue(KakaoPickerParser.decide(good, 10000, 20, emptyList(), emptyMap()))
    }

    @Test
    fun `알람 판정 - 픽커 줄임 동 표기가 «~동» 도착목표와 만난다 (0830 실사고 - 성남행 전부 탈락)`() {
        // 목적지 성남시의 실제 키워드 꼴: «~동» 전체 이름 + 시 별칭. 픽커는 «수내3»처럼 줄인다
        val seongnamDongs = listOf("정자동", "수내동", "금광동", "태평동", "신흥동")
        val aliases = listOf("성남", "수정구", "분당구", "중원구")
        // «분당 수내3» — 수내동인데 부분 문자열로는 «수내동»과 안 만난다 → 정규화 대조로 통과해야 한다
        val sungnam = parser.parse(listOf("퀵", "승", "예약", "내일", "강남", "16,478", "15.1km", "분당", "수내3", "수내3"))
        assertTrue(KakaoPickerParser.decide(sungnam, 10000, 20, seongnamDongs, emptyMap(), aliases))
        // 도착이 구 이름뿐인 카드(«수정») — 시 별칭 «수정구»로 통과해야 한다
        val guOnly = parser.parse(listOf("퀵", "소형", "수정", "12,000", "16.3km", "수정", "위례", "수정"))
        assertTrue(KakaoPickerParser.decide(guOnly, 10000, 20, seongnamDongs, emptyMap(), aliases))
        // 성남이 아닌 곳은 여전히 걸러진다
        val yongin = parser.parse(listOf("퀵", "단거리", "준비 완료", "소형", "기흥", "8,650", "16.9km", "기흥", "동백2", "동백2"))
        val t = FilterTally()
        assertFalse(KakaoPickerParser.decide(yongin, 5000, 20, seongnamDongs, emptyMap(), aliases, tally = t))
        assertEquals(1, t.region)
    }

    @Test
    fun `오더카드는 알람 상태에서 절대 자동 클릭하지 않는다 - 요금 닻이 곧 수락(계약) 버튼이다`() {
        // 실물(21:52 스크린샷): 오더카드의 «15,785»는 초록 수락 버튼 안 글자다 — 탭 = 계약.
        // 상세 화면 잔상(«수락하기» 포함)을 리스트로 오인한 유령 카드도 같은 관문에 걸린다.
        // ⚠️ 범위는 «알람 상태»다 (기사님 교정 0830) — 훗날 잡기 판(자동 선점)을 만들면
        //    그때는 수락 클릭이 곧 목적이므로, 이 관문은 알람 경로에만 산다.
        val offerCard = parser.parse(listOf("퀵", "승", "중형", "광주", "쌍령", "3.0km", "광주", "광남2", "4.3km", "15,785", "수락"))
        assertFalse(KakaoPickerParser.clickSafe(offerCard.rawText))
        val detailGhost = parser.parse(listOf("픽업지", "경기 성남시 수정구 위례동", "7,280", "넘기기", "수락하기"))
        assertFalse(KakaoPickerParser.clickSafe(detailGhost.rawText))
        // 평범한 리스트 줄은 눌러도 상세로 갈 뿐이다
        val listRow = parser.parse(listOf("퀵", "단거리", "준비 완료", "소형", "광주", "2,529", "4.7km", "광주", "경안", "경안"))
        assertTrue(KakaoPickerParser.clickSafe(listRow.rawText))
    }

    @Test
    fun `0830 실물 - 오더카드(수락 버튼)의 «수락»을 지역으로 오인하지 않는다`() {
        // 화면 위쪽에 뜨는 퀵 오더카드 — 상차·하차 km 둘 다 있고 초록 «수락» 버튼이 있다
        val texts = listOf("퀵", "승", "중형", "광주", "쌍령", "3.0km", "광주", "광남2", "4.3km", "15,785", "수락")
        val o = parser.parse(texts)
        assertEquals(15785, o.fare)
        assertFalse("수락이 지역으로 들어감: ${o.rawText}", o.pickup.contains("수락") || o.dropoff.contains("수락"))
    }

    @Test
    fun `알람 판정 - 도착지를 못 읽은 카드는 막지 않는다 (규칙 5 - 모르는 값으로 거르지 않는다)`() {
        // 화면 끝에 걸린 카드 — 도착 동이 안 잡혀 dropoff 가 빈다 (실수집 4건)
        val edge = parser.parse(listOf("퀵", "소형", "12,000", "5.0km", "태평1"))
        assertTrue(edge.dropoff.isEmpty())
        assertTrue(KakaoPickerParser.decide(edge, 10000, 20, listOf("성남"), emptyMap()))
    }

    @Test
    fun `0830 실수집 - 착불 배지와 «내일 착불» 겹노드를 지역으로 오인하지 않는다`() {
        // 실수집에서 pickup="내일 착불", dropoff="착불 분당" 으로 저장됐던 그 모양
        // (21:26 실물 스크린샷의 «강남 대치2 · 16,478 · 착불» 카드)
        val texts = listOf("퀵", "승", "예약", "내일 착불", "강남", "16,478", "15.1km", "분당", "수내3", "대치2")
        val o = parser.parse(texts)
        assertEquals("분당 수내3", o.pickup)
        assertEquals("강남 대치2", o.dropoff)
        assertTrue(o.tagsText!!.contains("착불"))
    }

    @Test
    fun `알람 판정 - 픽업거리를 모르면 막지 않는다 (규칙 5)`() {
        val o = parser.parse(listOf("퀵", "소형", "분당", "12,000", "분당", "야탑1", "이매1"))   // km 노드 없음
        assertTrue(KakaoPickerParser.decide(o, 10000, 10))
    }

    @Test
    fun `Context 없는 판(유닛 테스트)에서 shouldClick 은 기본값으로 판정한다 - 평가는 반드시 센다`() {
        // 기본 하한 1만 — 콜당 한 번만 울리는 근거(tally.seen → 지문 기억)가 유지되는지 (#79)
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
    fun `상세 잔상 판별 - «수락하기»가 보이는 리스트 스캔은 버린다 (0830 실측 23시04분)`() {
        // 상세→리스트 복귀 직후 첫 스캔에 상세 글자가 남아 카드에 섞였다
        // (실물: 도착이 «픽업지 경기 성남시 수정구 위례동 kotlin.Unit 삼성2»로 저장될 뻔)
        assertTrue(KakaoPickerParser.isDetailResidue(listOf("퀵", "3,300", "픽업지 경기 성남시", "넘기기", "수락하기")))
        // 평범한 리스트에는 «수락하기»가 없다 — 오더카드의 버튼도 «수락»이라 안 걸린다
        assertFalse(KakaoPickerParser.isDetailResidue(listOf("퀵", "단거리", "소형", "광주", "2,529", "4.7km", "경안", "수락")))
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
    fun `카드 묶기 - 노드는 가장 가까운 닻 하나에만 붙는다 (0830 실사고 - «처인 대치2» 이웃 섞임)`() {
        // 22:19 실물: 리스트 갱신 애니메이션 중 좌표가 눌려 두 닻(3,000·16,478)이 가까워졌고,
        // «±60 안이면 전부» 방식이라 사이에 낀 노드가 **두 카드 모두에** 들어갔다.
        // 판정 로그의 «16478원·도착 처인 대치2»(위 카드 시 + 아래 카드 동)가 그 증거다.
        val anchors = listOf(1124, 1224)          // 눌린 두 닻 중심 (평소 간격은 163)
        // 사이에 낀 노드(1180) — 둘 다에서 60 안이지만, 가까운 쪽(1224) 하나에만 붙어야 한다
        assertEquals(1, KakaoPickerParser.nearestAnchorIndex(anchors, 1180))
        // 닻 자신은 늘 자기 카드다 — 남의 카드에 요금이 섞이면 덮어써진다
        assertEquals(0, KakaoPickerParser.nearestAnchorIndex(anchors, 1124))
        // 어느 닻에서도 ±60 밖이면 어디에도 안 붙는다
        assertEquals(-1, KakaoPickerParser.nearestAnchorIndex(anchors, 1350))
    }

    @Test
    fun `카드 띠 판별 - 요금 중심 ±60이 한 카드다 (실측 줄 간격 ±35, 다음 카드 ±163)`() {
        assertTrue(KakaoPickerParser.inCardBand(961, 927))    // 태그줄
        assertTrue(KakaoPickerParser.inCardBand(961, 991))    // 지역줄
        assertFalse(KakaoPickerParser.inCardBand(961, 1090))  // 다음 카드 태그줄
        assertFalse(KakaoPickerParser.inCardBand(961, 795))   // 헤더
    }
}

/** 0831 실측 — 픽커는 1km 미만 픽업거리를 «581m»로 적는다. km 만 알면 거리가 도착지로 샌다 */
class MeterUnitTest {
    private val parser = KakaoPickerParser(null)
    @org.junit.Test
    fun `미터 표기를 픽업거리로 읽는다 - 도착지에 새지 않는다`() {
        val o = parser.parse(listOf("퀵", "단거리", "소형", "광주", "15,400", "581m", "광주", "초월읍", "쌍동2"))
        org.junit.Assert.assertEquals(0.581, o.pickupDistance!!, 0.001)
        org.junit.Assert.assertFalse(o.dropoff.contains("581m"))
    }
}
