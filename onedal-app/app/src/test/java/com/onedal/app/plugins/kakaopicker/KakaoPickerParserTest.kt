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

/**
 * 🖥️ **화면 판별 — 리스트 / 수락 전 상세 / 수락 후** (2026-09-02 신설).
 *
 * 어제 두 가지가 생겼다: ⑴ 픽커 «확정 전 상세»에서 미리보기 콜을 서버에 올린다
 * ⑵ 기사님이 「수락하기」를 누르면 그 화면을 알아보고 잡은 콜로 올린다.
 * 둘 다 **화면을 맞게 가르는 것**이 전제라, 여기서 그걸 잠근다.
 *
 * 🔴 **가장 위험한 오인은 «리스트를 상세로 읽는 것»이다.** 화면 판별이 상세를 리스트보다
 *    **먼저** 보기 때문에(`ScreenDetector` 우선순위 4 → 5), 리스트에 상세 낱말이 하나라도
 *    섞이면 리스트가 통째로 상세로 잡힌다. 그래서 실물 덤프 10종(리스트 7 · 상세 2 · 홈 1)
 *    으로 «리스트에는 «픽업»이 없다»를 확인하고 그 사실을 여기 박아 둔다.
 */
class PickerScreenDetectTest {
    private val kw = KakaoPickerKeywords.PICKER
    private val detector = com.onedal.app.core.engine.ScreenDetector()

    /** 실물 덤프 `화면덤프_0830/02_리스트.xml` 의 상단 낱말들 */
    private val 리스트 = "퀵 배송 도보배송 대리 한차배송 퀵 서포트 모드 1장 받기 " +
        "퀵 오더카드 대기 중 리스트 설정 높은 가격순 20km 퀵 소형 과천 15.2km 분당 서현1 중앙 16,870"

    /** 실물 덤프 `03_상세.xml` — 수락 전 (넘기기/수락하기) */
    private val 수락전상세 = "퀵 비즈 경기 성남시 분당구 서현1동 분당스퀘어 픽업 15.2km " +
        "경기 과천시 중앙동 배송 13.6km 물품정보 소형 최종 수익 16,870 넘기기 수락하기"

    /** ⚠️ 2023 자료 기준 추정 — 실물 캡처가 오면 이 문자열을 바꾼다 */
    private val 수락후 = "픽업 완료해주세요 15:03까지 픽업완료 픽업지 1.2km " +
        "충남 보령시 보령북로 16 복사 물품 정보 초소형 총 수익 27,280 길안내 픽업 완료하기"

    @Test
    fun `리스트는 리스트로 읽는다 - 상세로 오인하지 않는다`() {
        assertEquals(com.onedal.app.models.ScreenContext.LIST, detector.detect(리스트, kw))
    }

    @Test
    fun `수락 전 상세는 PRE_CONFIRM - 아직 계약 전이다`() {
        assertEquals(com.onedal.app.models.ScreenContext.DETAIL_PRE_CONFIRM, detector.detect(수락전상세, kw))
    }

    /**
     * 🔴 수락 후 화면은 **화면 분류로 잡지 않는다** (2026-09-02 실사고 수리).
     * 픽커 상세를 가르는 낱말(「넘기기」·「수락하기」)이 전부 «수락 전» 표식이라
     * 수락하면 사라진다 — 분류는 «상세 아님»으로 떨어지고, 승격은 `isAcceptedScreen` 이 한다.
     */
    @Test
    fun `수락 후 화면은 상세로 분류되지 않는다 - 승격은 따로 판정한다`() {
        assertFalse("수락 전 표식이 사라졌으니 상세가 아니다",
            detector.detect(수락후, kw) == com.onedal.app.models.ScreenContext.DETAIL_PRE_CONFIRM)
        assertTrue("대신 승격 판정이 참이어야 한다", KakaoPickerKeywords.isAcceptedScreen(수락후))
    }

    /** 🔴 잔상 한 줄로는 상세가 되지 않는다 — 낱말 둘을 함께 요구하는 이유 */
    @Test
    fun `리스트에 상세 잔상 한 줄이 남아도 상세로 오인하지 않는다 - 0902 실사고`() {
        val 잔상낀리스트 = "픽업지 경기 성남시 분당구 야탑3동 메종드자스민 " +
            "리스트 설정 가까운순 20km 퀵 반나절 소형 예약 09:00 15.4km 중원 도촌 영등포 여의 14,010"
        assertEquals(com.onedal.app.models.ScreenContext.LIST, detector.detect(잔상낀리스트, kw))
        assertFalse("승격도 하지 않는다", KakaoPickerKeywords.isAcceptedScreen(잔상낀리스트))
    }

    /**
     * 🔴 실물 덤프 10종 전수 — 리스트 계열에 «픽업»이 하나도 없다는 사실을 잠근다.
     * 이게 깨지면 `detailKeywords = ["픽업"]` 전제가 무너지므로 판별을 다시 짜야 한다.
     */
    @Test
    fun `리스트 계열에는 픽업이라는 낱말이 없다 - 실물 덤프 10종 근거`() {
        listOf(
            "퀵 배송 도보배송 리스트 설정 추천순 20km 퀵 승 3.0km 광주 쌍령 광주 광남2 15,785",
            "리스트 설정 높은 가격순 20km 퀵 단거리 준비 완료 소형 기흥 동백2 8,650",
            "퀵 오더카드 대기 중 리스트 설정 20km 퀵 반나절 중형 17.4km 수지 죽전2 영통3 22,166",
        ).forEach { assertFalse("리스트에 «픽업»이 있으면 상세로 오인한다", it.contains("픽업")) }
    }

    /** 수락 후 낱말 목록이 비면 «잡았다»를 영영 못 알아본다 — 빈 목록 방어 */
    @Test
    fun `수락 후 낱말 목록이 비어 있지 않다`() {
        assertTrue(KakaoPickerKeywords.ACCEPTED_SCREEN_WORDS.isNotEmpty())
        assertTrue(KakaoPickerKeywords.ACCEPTED_SCREEN_WORDS.any { 수락후.contains(it) })
    }

    /**
     * 🔴 **실사고 재현 (2026-09-02 08:37:17)** — 30초 자동 복귀가 도는 순간,
     * 상세에서 리스트로 넘어가는 **중간 프레임**에 「수락하기」만 먼저 사라지고
     * 「픽업」이 남았다. 판별이 그걸 «수락됨»으로 읽어 **안 누른 콜이 잡은 콜로 승격**됐다:
     *
     * ```
     * 08:36:46.884  DETAIL_PRE_CONFIRM   상세 진입 · 미리보기 전송 (정상)
     * 08:37:17.305  DETAIL_CONFIRMED     ← 30초 뒤, 아무도 안 눌렀는데
     * 08:37:17.306  ✅ [수락 확인] …     → sendDetail → 서버가 ORDER_CONFIRMED 로 승격
     * ```
     *
     * → **«수락하기가 없다»는 근거가 못 된다.** 수락 후 화면에만 있는 낱말을
     *    **적극적으로** 확인해야 한다 (`ACCEPTED_SCREEN_WORDS`).
     */
    @Test
    fun `상세에서 낱말이 부분만 남은 프레임을 수락으로 읽지 않는다 - 0902 실사고`() {
        // 실사고 그 화면: 「수락하기」가 사라지고 픽업지 줄만 남은 찰나
        val 중간프레임 = "픽업지 경기 성남시 분당구 야탑3동 메종드자스민 물품 정보 중형"
        assertTrue("사고 재현 전제 — 수락하기가 없고 픽업만 있다",
            !중간프레임.contains("수락하기") && 중간프레임.contains("픽업"))
        // 🔴 화면 분류는 여전히 «확정»으로 볼 수 있다 — 그래서 승격 판정을 따로 둔 것이다
        assertFalse("수락 후 표식이 없으면 승격하지 않는다",
            KakaoPickerKeywords.isAcceptedScreen(중간프레임))
    }

    @Test
    fun `진짜 수락 후 화면은 승격한다`() {
        assertTrue(KakaoPickerKeywords.isAcceptedScreen(수락후))
    }

    @Test
    fun `수락하기가 아직 보이면 승격하지 않는다 - 수락 전이다`() {
        assertFalse(KakaoPickerKeywords.isAcceptedScreen(수락전상세))
        // 두 표식이 한 화면에 겹쳐 보이는 찰나도 «아직 전»으로 본다 (안전한 쪽)
        assertFalse(KakaoPickerKeywords.isAcceptedScreen("픽업 완료하기 수락하기"))
    }

    @Test
    fun `빈 화면은 승격하지 않는다`() {
        assertFalse(KakaoPickerKeywords.isAcceptedScreen(null))
        assertFalse(KakaoPickerKeywords.isAcceptedScreen(""))
    }
}

/**
 * 🚚 **수락한 뒤의 운행 단계 다섯** (2026-09-02 신설 · 기사님 지시 *"23년도 자료로 지금 만들자"*).
 *
 * 문제지는 [`ex_images/카카오픽커/참고_2023_출처불명/`] 여섯 장에서 읽은 글자다.
 * ⚠️ **2023년 남의 자료라 낱말은 추정**이다 — 실물 캡처가 오면 `STAGE_WORDS` 만 갈아끼운다.
 * 여기서 잠그는 것은 **낱말이 아니라 구조**다: 헤더가 버튼을 이기고, 수락 전은 절대 안 걸린다.
 */
class PickerStageTest {
    private val K = KakaoPickerKeywords

    /** 자료 01 — 헤더 「픽업지로 이동하세요」인데 버튼은 이미 「밀어서 픽업 완료」 */
    @Test
    fun `이동 중에는 버튼이 아니라 헤더를 본다 - 도착으로 오인하지 않는다`() {
        val 화면 = "픽업지로 이동하세요 파리바게뜨 오더 정보 배송 물품 픽업하러 왔습니다 밀어서 픽업 완료"
        assertEquals(KakaoPickerKeywords.Stage.TO_PICKUP, K.stageOf(화면))
    }

    /** 자료 02 — 「픽업 완료해주세요 / 15:03까지 픽업완료 / 픽업 완료하기」 */
    @Test
    fun `픽업지 도착은 AT_PICKUP`() {
        val 화면 = "픽업 완료해주세요 15:03까지 픽업완료 픽업지 1.2km 충남 보령시 보령북로 16 길안내 픽업 완료하기"
        assertEquals(KakaoPickerKeywords.Stage.AT_PICKUP, K.stageOf(화면))
    }

    /** 자료 04 — 「배송지로 이동하세요 / 밀어서 배송 인증」 */
    @Test
    fun `배송지로 이동은 TO_DROPOFF`() {
        val 화면 = "배송지로 이동하세요 오더 정보 오더 번호 2206 고객 요청 밀어서 배송 인증"
        assertEquals(KakaoPickerKeywords.Stage.TO_DROPOFF, K.stageOf(화면))
    }

    /** 자료 05 — 「16:27까지 배송완료 / 배송 완료하기」 */
    @Test
    fun `배송지 도착은 AT_DROPOFF`() {
        val 화면 = "16:27까지 배송완료 배송지 28.7km 총 수익 27,280 오더 수행을 위한 팁 길안내 배송 완료하기"
        assertEquals(KakaoPickerKeywords.Stage.AT_DROPOFF, K.stageOf(화면))
    }

    /** 자료 06 — 「배송 완료 / 물품이 안전하게 전달되었습니다」 */
    @Test
    fun `배송을 마치면 DONE`() {
        val 화면 = "배송 완료 2,000 물품이 안전하게 전달되었습니다 오늘 배송 건수 1건 오더 목록 보기"
        assertEquals(KakaoPickerKeywords.Stage.DONE, K.stageOf(화면))
    }

    /**
     * 🔴 **수락 전 상세는 어떤 단계도 아니다.** 실물(2026) 상세에는 「17:04까지 픽업」·
     * 「17:18까지 배송」이 있는데, 단계 낱말은 «완료»가 붙은 「까지 픽업완료」다 —
     * 그 한 글자가 경계다. 「수락하기」가 보이는 것만으로도 무조건 걸러진다.
     */
    @Test
    fun `수락 전 상세는 단계가 아니다 - 계약 전이다`() {
        val 상세 = "퀵 단거리 배송 31분 남음 준비 17분 포함 경기 성남시 중원구 은행2동 픽업 14.6km " +
            "17:04까지 픽업 경기 성남시 중원구 중앙동 배송 2.1km 17:18까지 배송 넘기기 수락하기"
        assertNull(K.stageOf(상세))
        assertFalse(K.isAcceptedScreen(상세))
    }

    /** 🔴 리스트·잔상은 단계가 아니다 (0902 실사고 재현) */
    @Test
    fun `리스트와 상세 잔상은 단계가 아니다`() {
        assertNull(K.stageOf("리스트 설정 가까운순 20km 퀵 반나절 소형 15.4km 중원 도촌 영등포 여의 14,010"))
        assertNull(K.stageOf("픽업지 경기 성남시 분당구 야탑3동 메종드자스민 리스트 설정 가까운순 20km"))
        assertNull(K.stageOf(null))
        assertNull(K.stageOf(""))
    }

    /** 🔴 «수락됨» 판정의 원천은 `stageOf` 하나다 — 목록을 손으로 또 적지 않는다 (규칙 ③) */
    @Test
    fun `수락됨 판정은 단계표에서 파생된다`() {
        assertEquals(K.STAGE_WORDS.flatMap { it.second }, K.ACCEPTED_SCREEN_WORDS)
        assertTrue(K.STAGE_WORDS.size == KakaoPickerKeywords.Stage.values().size)
    }
}
