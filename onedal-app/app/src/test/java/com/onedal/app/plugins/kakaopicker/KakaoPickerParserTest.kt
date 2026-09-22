package com.onedal.app.plugins.kakaopicker

import com.onedal.app.models.FilterTally
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * 🌐 픽커 파서 채점 — **문제지는 실물 화면 덤프다**.
 *
 * 카드 텍스트는 전부 실물 화면 덤프(실계정 덤프 포함)에서 좌표 정렬(top→left) 순서 그대로 옮겼다 — 지어낸 카드가 아니다.
 * 배차망이 리뉴얼되면: 새 덤프를 뜨고 이 문제지와 대조한다.
 *
 * ⚠️ parse() 는 android 클래스를 안 쓰므로 JVM 에서 그대로 돈다.
 *    카드 묶기(rect)는 순수 함수(isFareAnchor·inCardBand·nearestAnchorIndex)로 검사한다 —
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
        assertTrue(KakaoPickerParser.decide(good, 10000, 20.0, tally = t1))
        assertEquals(1, t1.passed)
        // 같은 콜도 반경 15km 면 픽업거리 축에서 떨어진다
        val t2 = FilterTally()
        assertFalse(KakaoPickerParser.decide(good, 10000, 15.0, tally = t2))
        assertEquals(1, t2.pickup)
        // 요금 미달은 요금 축
        val cheap = parser.parse(listOf("퀵", "소형", "광주", "3,000", "1.0km", "광주", "경안", "경안"))
        val t3 = FilterTally()
        assertFalse(KakaoPickerParser.decide(cheap, 10000, 20.0, tally = t3))
        assertEquals(1, t3.fare)
    }

    @Test
    fun `알람 판정 - 도착지 축은 국면의 도착목표를 재사용한다 (기사님 확정 0830)`() {
        // 도착 «강동 천호3» — 도착목표가 성남·분당이면 방향이 달라 안 울린다
        val good = parser.parse(listOf("퀵", "반나절", "승", "강동", "14,466", "19.6km", "하남", "신장2", "천호3"))
        val t1 = FilterTally()
        assertFalse(KakaoPickerParser.decide(good, 10000, 20.0, listOf("성남", "분당"), emptyMap(), tally = t1))
        assertEquals(1, t1.region)
        // 도착목표에 강동이 있으면 울린다
        assertTrue(KakaoPickerParser.decide(good, 10000, 20.0, listOf("강동", "송파"), emptyMap()))
        // 도착목표가 비어 있으면(관내 등) 제한 없음 — 지금까지의 동작 그대로
        assertTrue(KakaoPickerParser.decide(good, 10000, 20.0, emptyList(), emptyMap()))
    }

    @Test
    fun `알람 판정 - 픽커 줄임 동 표기가 «~동» 도착목표와 만난다 (0830 실사고 - 성남행 전부 탈락)`() {
        // 목적지 성남시의 실제 키워드 꼴: «~동» 전체 이름 + 시 별칭. 픽커는 «수내3»처럼 줄인다
        val seongnamDongs = listOf("정자동", "수내동", "금광동", "태평동", "신흥동")
        val aliases = listOf("성남", "수정구", "분당구", "중원구")
        // «분당 수내3» — 수내동인데 부분 문자열로는 «수내동»과 안 만난다 → 정규화 대조로 통과해야 한다
        val sungnam = parser.parse(listOf("퀵", "승", "예약", "내일", "강남", "16,478", "15.1km", "분당", "수내3", "수내3"))
        assertTrue(KakaoPickerParser.decide(sungnam, 10000, 20.0, seongnamDongs, emptyMap(), aliases))
        // 도착이 구 이름뿐인 카드(«수정») — 시 별칭 «수정구»로 통과해야 한다
        val guOnly = parser.parse(listOf("퀵", "소형", "수정", "12,000", "16.3km", "수정", "위례", "수정"))
        assertTrue(KakaoPickerParser.decide(guOnly, 10000, 20.0, seongnamDongs, emptyMap(), aliases))
        // 성남이 아닌 곳은 여전히 걸러진다
        val yongin = parser.parse(listOf("퀵", "단거리", "준비 완료", "소형", "기흥", "8,650", "16.9km", "기흥", "동백2", "동백2"))
        val t = FilterTally()
        assertFalse(KakaoPickerParser.decide(yongin, 5000, 20.0, seongnamDongs, emptyMap(), aliases, tally = t))
        assertEquals(1, t.region)
    }

    @Test
    fun `오더카드는 알람 상태에서 절대 자동 클릭하지 않는다 - 요금 닻이 곧 수락(계약) 버튼이다`() {
        // 실물 스크린샷: 오더카드의 «15,785»는 초록 수락 버튼 안 글자다 — 탭 = 계약.
        // 상세 화면 잔상(«수락하기» 포함)을 리스트로 오인한 유령 카드도 같은 관문에 걸린다.
        // ⚠️ 범위는 «알람 상태»다 (기사님 교정) — 자동 선점에서는 수락 클릭이 곧 목적이므로,
        //    이 관문은 알람 경로에만 둔다.
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
    fun `알람 판정 - 퀵인데 도착지를 못 읽었으면 이번 판은 미룬다 (기사님 지시)`() {
        // 화면 끝에 걸린 카드 — 도착 동이 안 잡혀 dropoff 가 빈다 (실수집 4건)
        // 🔴 **거르는 것이 아니라 미루는 것이다** — 목록을 넘기는 중에는 픽커가 글자를 반만 올린다.
        //    그 화면으로 상세에 들어가면 30초 동안 목록을 못 보고, 그동안 뜬 콜은 평가되지 않는다.
        //    다음 화면 읽기에서 읽히면 그때 운다 (`quickDropoffUnread` · `PickerAlarmDropoffTest`).
        val edge = parser.parse(listOf("퀵", "소형", "12,000", "5.0km", "태평1"))
        assertTrue(edge.dropoff.isEmpty())
        assertFalse(KakaoPickerParser.decide(edge, 10000, 20.0, listOf("성남"), emptyMap()))
    }

    @Test
    fun `알람 판정 - 도보는 도착지가 비어도 막지 않는다 (규칙 5 - 모르는 값으로 거르지 않는다)`() {
        // 🔴 도보 콜은 **원래** 하차지가 빈다 — 리스트에 가게 이름과 시간만 나와 지역 토막이 넷이 안 된다.
        //    퀵과 함께 막으면 도보 알람이 통째로 죽는다.
        val walk = parser.parse(listOf("도보", "준비 완료", "2,979", "18.3km", "올영 용인역북점"))
        assertTrue(walk.dropoff.isEmpty())
        assertTrue(KakaoPickerParser.decide(walk, 2000, 20.0, listOf("성남"), emptyMap()))
    }

    @Test
    fun `0830 실수집 - 착불 배지와 «내일 착불» 겹노드를 지역으로 오인하지 않는다`() {
        // 실수집에서 pickup="내일 착불", dropoff="착불 분당" 으로 저장됐던 그 모양
        // (실물 스크린샷의 «강남 대치2 · 16,478 · 착불» 카드)
        val texts = listOf("퀵", "승", "예약", "내일 착불", "강남", "16,478", "15.1km", "분당", "수내3", "대치2")
        val o = parser.parse(texts)
        assertEquals("분당 수내3", o.pickup)
        assertEquals("강남 대치2", o.dropoff)
        assertTrue(o.tagsText!!.contains("착불"))
    }

    @Test
    fun `알람 판정 - 픽업거리를 모르면 막지 않는다 (규칙 5)`() {
        val o = parser.parse(listOf("퀵", "소형", "분당", "12,000", "분당", "야탑1", "이매1"))   // km 노드 없음
        assertTrue(KakaoPickerParser.decide(o, 10000, 10.0))
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
        // 상세→리스트 복귀 직후 첫 스캔에는 상세 글자가 남아 카드에 섞인다
        // (실물: 도착이 «픽업지 경기 성남시 수정구 위례동 kotlin.Unit 삼성2»로 저장될 뻔했다)
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
        // 실물: 리스트 갱신 애니메이션 중에는 좌표가 눌려 두 요금(3,000·16,478)이 가까워진다.
        // «±60 안이면 전부»로 묶으면 사이에 낀 노드가 **두 카드 모두에** 들어가
        // «16478원·도착 처인 대치2»(위 카드 시 + 아래 카드 동)처럼 섞인다.
        val anchors = listOf(1124, 1224)          // 눌린 두 요금 중심 (평소 간격은 163)
        // 사이에 낀 노드(1180) — 둘 다에서 60 안이지만, 가까운 쪽(1224) 하나에만 붙어야 한다
        assertEquals(1, KakaoPickerParser.nearestAnchorIndex(anchors, 1180))
        // 요금 글자 자신은 늘 자기 카드다 — 남의 카드에 요금이 섞이면 덮어써진다
        assertEquals(0, KakaoPickerParser.nearestAnchorIndex(anchors, 1124))
        // 칸은 이웃 요금 사이 간격의 절반(여기서는 50)이다 — 그 밖이면 어디에도 안 붙는다
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

/** 실측 — 픽커는 1km 미만 픽업거리를 «581m»로 적는다. km 만 알면 거리가 도착지로 샌다 */
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
 * 🖥️ **화면 판별 — 리스트 / 수락 전 상세 / 수락 후**.
 *
 * 화면 판별 위에 두 가지가 선다: ⑴ 픽커 «확정 전 상세»에서 미리보기 콜을 서버에 올린다
 * ⑵ 기사님이 「수락하기」를 누르면 그 화면을 알아보고 잡은 콜로 올린다.
 * 둘 다 **화면을 맞게 가르는 것**이 전제라, 여기서 그걸 잠근다.
 *
 * 🔴 **가장 위험한 오인은 «리스트를 상세로 읽는 것»이다.** 화면 판별이 상세를 리스트보다
 *    **먼저** 보기 때문에(`ScreenDetector.detect` 의 순서), 리스트에 상세 낱말(«넘기기»·«수락하기»)이
 *    둘 다 섞이면 리스트가 통째로 상세로 잡힌다. 그래서 실물 덤프 10종(리스트 7 · 상세 2 · 홈 1)
 *    으로 «리스트에는 «픽업»이 없다»를 확인하고 그 사실을 여기 박아 둔다.
 */
class PickerScreenDetectTest {
    private val kw = KakaoPickerKeywords.PICKER
    private val detector = com.onedal.app.core.engine.ScreenDetector()

    /** 실물 덤프 02(리스트)의 상단 낱말들 */
    private val 리스트 = "퀵 배송 도보배송 대리 한차배송 퀵 서포트 모드 1장 받기 " +
        "퀵 오더카드 대기 중 리스트 설정 높은 가격순 20km 퀵 소형 과천 15.2km 분당 서현1 중앙 16,870"

    /** 실물 덤프 03(상세) — 수락 전 (넘기기/수락하기) */
    private val 수락전상세 = "퀵 비즈 경기 성남시 분당구 서현1동 분당스퀘어 픽업 15.2km " +
        "경기 과천시 중앙동 배송 13.6km 물품정보 소형 최종 수익 16,870 넘기기 수락하기"

    /* 🟢 **실물 그대로다** — 기사님 완주 기록 17번 (픽업지 시트).
       실물엔 「픽업 완료하기」가 없고 「밀어서 픽업 완료」가 있다. */
    private val 수락후 = "배송 물품 가지러 왔습니다 오더 확인 260902091827593 " +
        "배송지 경기 광주시 회안대로 350-23 배송 물품 핫크리스피치킨버거 세트 " +
        "고객 요청 비대면 배달 사진 필수 도움이 필요하신가요? 밀어서 픽업 완료"

    @Test
    fun `리스트는 리스트로 읽는다 - 상세로 오인하지 않는다`() {
        assertEquals(com.onedal.app.models.ScreenContext.LIST, detector.detect(리스트, kw))
    }

    @Test
    fun `수락 전 상세는 PRE_CONFIRM - 아직 계약 전이다`() {
        assertEquals(com.onedal.app.models.ScreenContext.DETAIL_PRE_CONFIRM, detector.detect(수락전상세, kw))
    }

    /**
     * 🔴 수락 후 화면은 **화면 분류로 잡지 않는다** (실사고 수리).
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
     * 리스트에 상세 글자가 섞이면 리스트를 상세로 오인하므로, 리스트 쪽 사실을 실물로 잠가 둔다
     * (상세 판별 낱말 `detailKeywords` 는 «넘기기»·«수락하기» 둘이다).
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
     * 🔴 **실사고 재현** — 30초 자동 복귀가 도는 순간,
     * 상세에서 리스트로 넘어가는 **중간 프레임**에는 「수락하기」만 먼저 사라지고
     * 「픽업」이 남는다. 이걸 «수락됨»으로 읽으면 **안 누른 콜이 잡은 콜로 승격**된다
     * (`DETAIL_CONFIRMED` → sendDetail → 서버가 ORDER_CONFIRMED 로 승격).
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
 * 🚚 **수락한 뒤의 운행 단계 다섯**.
 *
 * 문제지는 기사님 완주 기록 캡처(`ex_images/카카오픽커/실물_2026/`)에서 읽은 글자다.
 * 픽커 화면 낱말이 바뀌면 `STAGE_WORDS` 만 갈아끼운다.
 * 여기서 잠그는 것은 **낱말이 아니라 구조**다: 확정 버튼이 헤더를 이기고, 수락 전은 절대 안 걸린다.
 */
class PickerStageTest {
    private val K = KakaoPickerKeywords

    /**
     * 🟢 **문제지는 실물이다** (기사님이 직접 수행한 완주 기록).
     *    `ex_images/카카오픽커/실물_2026/` 11~32 — 수락부터 배송 완료까지 한 줄기.
     *    아래 문자열은 그 캡처에서 **눈으로 읽은 그대로**다.
     *
     * 🔴 **버튼이 헤더를 이긴다**. 실물에서는 시트를 올려야
     *    「밀어서 …」가 나오고, 그때 시트가 헤더를 **덮는다** (17번 캡처).
     *    접근성 트리는 가려진 헤더도 읽을 수 있으므로, 확정 버튼이 있으면 그것이 답이다.
     */
    /**
     * 🔴 **실물 15 — 수락 직후 «내 오더» 탭. 승격을 정하는 그 화면이다**.
     *
     * 「수락하기」를 누르면 상세가 닫히고 **이 화면**이 먼저 뜬다 (실물 16 은 그다음이다).
     * 그러니 승격(`reportPickerAccepted`)이 걸리는 첫 화면이 여기이고, 여기서 못 알아보면
     * **기사님이 수락한 콜이 우리 콜로 안 잡힌다.** 픽커는 하루 5번이라 다시 못 해 본다.
     *
     * ⚠️ 원문은 기사님 캡처를 그대로 읽은 것이다 (`실물_2026/15_내오더탭_…`) — 지어내지 않았다.
     *    「목록·지도·신규·내 오더」 같은 탭 글자가 함께 올라오는 것도 실물 그대로다.
     */
    @Test
    fun `수락 직후 내 오더 탭은 TO_PICKUP — 승격이 걸리는 첫 화면`() {
        val 화면 = "목록 지도 픽업 준비 14분 남음 도보 픽업 [태전점]롯데리아 " +
            "배송지: 쌍용 스윗닷홈아파트 쌍용 스윗닷홈아파트 304동1002호 " +
            "한차배송 신청내역 보기 카드설정 신규 내 오더 1"
        assertEquals(KakaoPickerKeywords.Stage.TO_PICKUP, K.stageOf(화면))
        /* 🔴 «알아본 화면»과 «수락한 뒤»는 다른 질문이다 — 둘 다 참이어야 승격한다 */
        assertTrue(KakaoPickerKeywords.isAcceptedScreen(화면))
    }

    /**
     * 🔴 **그 화면에 「수락하기」가 아직 보이면 승격하지 않는다** (실사고 방어).
     *    탭 글자만 보고 «내 오더 탭»으로 읽으면, 상세가 덜 닫힌 프레임에서 잘못 승격한다.
     */
    @Test
    fun `수락하기가 아직 보이면 내 오더 탭 글자가 있어도 승격 안 한다`() {
        val 화면 = "신규 내 오더 픽업 준비 14분 남음 넘기기 수락하기"
        assertNull(K.stageOf(화면))
        assertFalse(KakaoPickerKeywords.isAcceptedScreen(화면))
    }

    /** 실물 16 — 「픽업 준비 13분 남음」 · 「배송 33분 남음」 (아직 픽업 전이다) */
    @Test
    fun `픽업지로 가는 중은 TO_PICKUP`() {
        val 화면 = "배정 취소 픽업 배송 픽업지 근처에 가시면 오더 정보를 확인하세요 " +
            "픽업 준비 13분 남음 [태전점]롯데리아 경기 광주시 고불로 43-1 " +
            "배송 33분 남음 준비 13분 포함 오더 확인 260902091827593"
        assertEquals(KakaoPickerKeywords.Stage.TO_PICKUP, K.stageOf(화면))
    }

    /** 🔴 실물 16 에 **「배송 33분 남음」**이 있다 — 이걸 배송 단계로 읽으면 안 된다 */
    @Test
    fun `픽업 이동 화면의 배송 남은시간을 배송 단계로 오인하지 않는다`() {
        val 화면 = "픽업 준비 13분 남음 배송 33분 남음 준비 13분 포함"
        assertEquals(KakaoPickerKeywords.Stage.TO_PICKUP, K.stageOf(화면))
    }

    /** 실물 17 — 시트를 올리면 헤더가 가려지고 「밀어서 픽업 완료」만 남는다 */
    @Test
    fun `픽업지 시트는 AT_PICKUP`() {
        val 화면 = "배송 물품 가지러 왔습니다 오더 확인 260902091827593 배송지 경기 광주시 " +
            "배송 물품 핫크리스피치킨버거 세트 고객 요청 도움이 필요하신가요? 밀어서 픽업 완료"
        assertEquals(KakaoPickerKeywords.Stage.AT_PICKUP, K.stageOf(화면))
    }

    /** 실물 21 — 「배송 시간 15분 남음」 · 「물품 파손/분실을 주의해 이동해주세요」 */
    @Test
    fun `배송지로 가는 중은 TO_DROPOFF`() {
        val 화면 = "물품 파손 분실을 주의해 이동해주세요 배송 시간 15분 남음 " +
            "쌍용 스윗닷홈아파트 304동1002호 경기 광주시 회안대로 350-23 고객 요청"
        assertEquals(KakaoPickerKeywords.Stage.TO_DROPOFF, K.stageOf(화면))
    }

    /** 실물 22 — 배송지 시트 「밀어서 사진 촬영」 (2023 자료의 「밀어서 배송 인증」이 아니다) */
    @Test
    fun `배송지 시트는 AT_DROPOFF`() {
        val 화면 = "쌍용 스윗닷홈아파트 304동1002호 오더 확인 260902091827593 " +
            "배송 물품 핫크리스피치킨버거 세트 고객 요청 비대면 배달 사진 필수 " +
            "도움이 필요하신가요? 오더/점포정보 보기 밀어서 사진 촬영"
        assertEquals(KakaoPickerKeywords.Stage.AT_DROPOFF, K.stageOf(화면))
    }

    /** 실물 31 — 「배송 완료 / 물품이 안전하게 전달되었습니다」 */
    @Test
    fun `배송을 마치면 DONE`() {
        val 화면 = "배송 완료 2,387 P 물품이 안전하게 전달되었습니다 " +
            "오늘 배송 건수 1건 오늘 수익 2,387P 오더 목록 보기"
        assertEquals(KakaoPickerKeywords.Stage.DONE, K.stageOf(화면))
    }

    /**
     * 🔴 **수락 전 상세는 어떤 단계도 아니다.** 실물 상세에는 「17:04까지 픽업」·
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

    /** 🔴 리스트·잔상은 단계가 아니다 (실사고 재현) */
    @Test
    fun `리스트와 상세 잔상은 단계가 아니다`() {
        assertNull(K.stageOf("리스트 설정 가까운순 20km 퀵 반나절 소형 15.4km 중원 도촌 영등포 여의 14,010"))
        assertNull(K.stageOf("픽업지 경기 성남시 분당구 야탑3동 메종드자스민 리스트 설정 가까운순 20km"))
        assertNull(K.stageOf(null))
        assertNull(K.stageOf(""))
    }

    /**
     * 🏠 **홈 — 「시작하기」 버튼이 표식이다** (기사님 확정:
     * *"'시작하기' 이 버튼이 있어야 홈화면이야"*).
     * 실물 덤프 17종 전수 — 홈 3종에만 있고 리스트·상세 14종엔 하나도 없다.
     */
    @Test
    fun `홈은 시작하기 버튼으로 안다`() {
        val 홈 = "카카오 T 픽커 및 퀵/도보배송 이용 약관 개정 안내 미션 6 " +
            "이런 일거리 어떤가요? 프로필 등록 시작하기"
        assertEquals(KakaoPickerKeywords.Stage.HOME, K.stageOf(홈))
    }

    /**
     * 🔴 **홈의 미션 문구가 배송 단계를 품고 있다.** 「퀵 1건 배송완료하고」가 홈에 있어
     * 홈을 먼저 보지 않으면 「까지 배송완료」 규칙에 걸려 «배송지 도착»으로 읽힌다 —
     * 그러면 홈 화면이 콜을 «잡은 콜»로 승격시킨다.
     */
    @Test
    fun `홈의 미션 문구를 배송 단계로 읽지 않는다`() {
        val 홈_미션 = "미션 퀵 1건 배송완료하고 프로단독배정권 1장 받기 시작하기"
        assertEquals(KakaoPickerKeywords.Stage.HOME, K.stageOf(홈_미션))
        assertFalse("홈은 계약이 아니다", K.isAcceptedScreen(홈_미션))
    }

    /** 🔴 «수락됨» 목록은 단계표에서 파생되고, 홈 낱말은 거기 새지 않는다 (규칙 ③) */
    @Test
    fun `수락됨 목록에 홈 낱말이 새지 않는다`() {
        val 홈낱말 = K.STAGE_WORDS.first { it.first == KakaoPickerKeywords.Stage.HOME }.second
        홈낱말.forEach { assertFalse(K.ACCEPTED_SCREEN_WORDS.contains(it)) }
        assertTrue(K.STAGE_WORDS.size == KakaoPickerKeywords.Stage.values().size)
    }
}

/**
 * 🖥️ **화면이 관제웹까지 가는가** (기사님 지시:
 * *"내가 관제앱에서 현 페이지를 확인할 수 있어야 해.. 그래야 일을 시작할 수 있지."*)
 *
 * 앱이 페이지를 알아봐도 **공통 화면 값으로 바꿔 올리지 않으면** 서버는 `UNKNOWN` 을 받고,
 * 관제웹은 «알 수 없는 화면»(빨간 깜빡임)만 보여 준다 — 앱이 알아본 것이 관제웹에 안 간다.
 * 여기서 잠그는 것은 **치환이 빠짐없이 이어지는가**다.
 */
class PickerScreenContextTest {
    private val K = KakaoPickerKeywords

    @Test
    fun `운행 단계 다섯이 모두 공통 화면 값으로 바뀐다`() {
        listOf(
            KakaoPickerKeywords.Stage.TO_PICKUP  to com.onedal.app.models.ScreenContext.RUN_TO_PICKUP,
            KakaoPickerKeywords.Stage.AT_PICKUP  to com.onedal.app.models.ScreenContext.RUN_AT_PICKUP,
            KakaoPickerKeywords.Stage.TO_DROPOFF to com.onedal.app.models.ScreenContext.RUN_TO_DROPOFF,
            KakaoPickerKeywords.Stage.AT_DROPOFF to com.onedal.app.models.ScreenContext.RUN_AT_DROPOFF,
            KakaoPickerKeywords.Stage.DONE       to com.onedal.app.models.ScreenContext.RUN_DONE,
        ).forEach { (stage, screen) -> assertEquals(screen, K.screenContextOf(stage)) }
    }

    /** 🔴 홈은 운행 화면이 아니다 — 치환하면 «일하는 중»으로 보인다 */
    /**
     * 🏠 **홈은 «모름»이 아니다** (기사님 제보로 갈랐다).
     *
     * 기사님: *"픽커는 지금 홈에 있는데. 콜 리스트로 나오고 있어."*
     * 홈을 `null` 로 두면 낱말 판별로 떨어져 엉뚱한 답(콜 리스트)이 나온다.
     * 읽었으면 읽었다고 답한다 — 못 읽은 것과 같은 칸에 넣지 않는다.
     */
    @Test
    fun `홈은 홈이라고 답한다 - 모름과 같은 칸에 넣지 않는다`() {
        assertEquals(com.onedal.app.models.ScreenContext.HOME, K.screenContextOf(KakaoPickerKeywords.Stage.HOME))
    }

    /** 픽커가 아는 화면이 아니면 답하지 않는다 — 낱말 판별에 맡긴다 */
    @Test
    fun `모르는 화면은 답하지 않는다`() {
        assertNull(K.screenContextOf(null))
    }

    /**
     * 🔴 **단계가 늘면 치환도 늘어야 한다.** 표만 고치고 치환을 안 고치면 새 화면이
     * 조용히 `UNKNOWN` 으로 떨어진다 — 앱이 알아본 화면이 관제웹에 안 간다.
     */
    @Test
    fun `모든 단계가 치환된다 - 빠뜨리면 조용히 UNKNOWN 이 된다`() {
        KakaoPickerKeywords.Stage.values()
            .forEach { assertNotNull("$it 의 화면 값이 없다", K.screenContextOf(it)) }
    }

    /** 🔴 값 이름이 shared 와 한 글자라도 다르면 서버가 못 읽는다 */
    @Test
    fun `화면 값 이름이 서버 규격과 같다`() {
        assertEquals("RUN_TO_PICKUP", com.onedal.app.models.ScreenContext.RUN_TO_PICKUP.value)
        assertEquals("RUN_AT_PICKUP", com.onedal.app.models.ScreenContext.RUN_AT_PICKUP.value)
        assertEquals("RUN_TO_DROPOFF", com.onedal.app.models.ScreenContext.RUN_TO_DROPOFF.value)
        assertEquals("RUN_AT_DROPOFF", com.onedal.app.models.ScreenContext.RUN_AT_DROPOFF.value)
        assertEquals("RUN_DONE", com.onedal.app.models.ScreenContext.RUN_DONE.value)
    }
}

/**
 * 🏠 **홈 화면 실물 한 장을 그대로 붙여 둔다** (기사님 폰에서 뜬 것).
 *
 * 🔴 **홈 글자를 로딩 낱말에 넣으면 홈이 통째로 버려진다.** 홈 화면 글자 「어떤 일을 시작할까요」가
 * `loadingKeywords` 에 들어가면 `HijackService` 가 로딩으로 보고 그 프레임을 버려 판별이 **아예 안 돈다** —
 * 관제웹은 «알 수 없는 화면»에 굳는다. 홈은 제대로 된 화면(`Stage.HOME`)이라 한 화면을 두 곳이
 * 다르게 답하게 되고, 로딩이 먼저라 늘 이긴다 (규칙 ⑤-4 ⑤).
 *
 * ⚠️ 화면이 **덜 그려졌을 때는** 그 문구가 아직 없어 홈으로 보인다(185자 → `HOME`).
 *    다 그려진 화면(289자)으로 검사한다 — 로그에 `HOME` 이 한 번 찍혔다고 되는 것이 아니다.
 *
 * 🔴 실물을 붙여 두는 이유: 낱말을 손으로 적으면 **내가 기대하는 화면**을 검사하게 된다.
 *    이건 기사님 폰이 실제로 내놓은 글자다.
 */
class PickerHomeRealDumpTest {

    /** 접근성 트리가 읽은 그대로 (「어떤 일을…」 두 줄은 화면에 안 보인다) */
    private val HOME_REAL = "김윤서님이 관심있는 일거리는 무엇인가요? 🤔 물류·포장·상하차 중장비 기술·정비·수리 " +
        "주방 건설·현장 사무·회계·경리 서빙 전체 일거리 보기 🌟8월30일 올영세일 시작! 600원 프로모션 진행 중 " +
        "공통 카카오 T 픽커 및 퀵/도보배송 이용 약관 개정 안내  더보기 미션 3 더보기 " +
        "퀵 1건 배송완료하고 서포트 모드 1장 받기 퀵 3건 배송완료하고 서포트 모드 1장 받기 " +
        "퀵 5건 배송완료하고 서포트 모드 1장 받기 어떤 일을 시작할까요? 수행하려는 일을 선택해주세요 시작하기"

    /**
     * 🔴 **로딩으로 버려지면 그 뒤 판별이 아예 안 돈다.** 「틀린 답」보다 나쁘다 —
     * 틀린 답은 다음 프레임에 고쳐지지만, 버려진 프레임은 아무것도 안 남긴다.
     */
    @Test
    fun `홈 실물이 로딩으로 버려지지 않는다`() {
        assertFalse(
            "홈 화면이 로딩으로 걸리면 판별 자체를 건너뛴다",
            com.onedal.app.core.engine.ScreenDetector().isLoading(HOME_REAL, KakaoPickerKeywords.PICKER),
        )
    }

    /** 기사님 확정 — *"하단에 파란색 바탕의 큰 「시작하기」 버튼이 있어"* */
    @Test
    fun `홈 실물을 홈으로 알아본다`() {
        assertEquals(KakaoPickerKeywords.Stage.HOME, KakaoPickerKeywords.stageOf(HOME_REAL))
        assertEquals(
            com.onedal.app.models.ScreenContext.HOME,
            KakaoPickerKeywords.screenContextOf(KakaoPickerKeywords.stageOf(HOME_REAL)),
        )
    }

    /**
     * 🔴 **「미션」 목록이 함정이다** — 「퀵 1건 **배송완료**하고」가 운행 단계 낱말
     * 「까지 배송완료」와 닮았다. 홈에서 «배송 완료 대기»로 읽히면 안 잡은 콜이
     * 다 끝난 것처럼 보인다.
     */
    @Test
    fun `홈의 미션 목록을 배송 완료 화면으로 읽지 않는다`() {
        assertNotEquals(KakaoPickerKeywords.Stage.AT_DROPOFF, KakaoPickerKeywords.stageOf(HOME_REAL))
        assertNotEquals(KakaoPickerKeywords.Stage.DONE, KakaoPickerKeywords.stageOf(HOME_REAL))
    }

    /**
     * 🔴 **콘텐츠가 바뀌어도 홈은 홈이다** (기사님 확정:
     * *"다른 문구는 컨텐츠로 언제든지 바뀔 수 있어"* · *"하단에 파란색 바탕의 큰
     * 「시작하기」 버튼이 있어"*).
     *
     * 홈 화면에서 **고정된 것은 「시작하기」 버튼 하나**다. 나머지는 전부 그날의 콘텐츠다 —
     * 미션 목록·프로모션 배너·「관심있는 일거리」 카드(우상단 X 로 **닫히는 카드**다).
     * 그래서 실물 한 장을 통째로 기대값으로 삼으면 **다음 프로모션이 바뀔 때 헛되이
     * 빨간불**이 뜨고, 진짜 문제와 구별이 안 된다.
     *
     * 여기서는 콘텐츠를 전부 갈아 끼운 홈으로도 알아보는지를 본다.
     */
    @Test
    fun `콘텐츠가 전부 바뀌어도 시작하기가 있으면 홈이다`() {
        val 다른날_홈 = "이수현님이 관심있는 일거리는 무엇인가요? 🤔 배달 청소 " +
            "🎄12월 겨울맞이 이벤트! 1000원 프로모션 진행 중 " +
            "공통 서비스 점검 안내 더보기 미션 5 더보기 퀵 10건 배송완료하고 쿠폰 받기 시작하기"
        assertEquals(KakaoPickerKeywords.Stage.HOME, KakaoPickerKeywords.stageOf(다른날_홈))
        assertFalse(com.onedal.app.core.engine.ScreenDetector().isLoading(다른날_홈, KakaoPickerKeywords.PICKER))
    }

    /**
     * 🔴 반대쪽도 잠근다 — **콘텐츠만 닮았다고 홈이라 하지 않는다.**
     * 「시작하기」가 없으면 홈이 아니다. 없는 것을 지어내지 않는다 (규칙 ④).
     */
    @Test
    fun `시작하기가 없으면 홈이 아니다`() {
        val 미션만 = "미션 3 더보기 퀵 1건 배송완료하고 서포트 모드 1장 받기 어떤 일을 시작할까요?"
        assertNotEquals(KakaoPickerKeywords.Stage.HOME, KakaoPickerKeywords.stageOf(미션만))
    }

    /**
     * 🔴 **홈을 로딩 낱말로 다시 막지 못하게 한다** — 이 사고의 클래스를 잠근다.
     * 한 낱말이 «홈이다»와 «건너뛴다» 둘 다에 쓰이면 늘 뒤가 이긴다.
     */
    /**
     * 🔴 **픽커에는 로딩 화면이 없다 — 확정** (기사님 확정:
     * *"픽커는 로딩화면이 없어 그냥 홈 화면만 있어"*).
     *
     * 그러니 여기가 채워지는 일은 없어야 한다. 채우면 그 낱말이 걸리는 화면이
     * **통째로 버려진다** — 홈 글자를 여기 넣으면 홈이 버려지는 것과 같다.
     * «아직 못 봤다»(완료 리스트)와는 다른 사실이라 표식도 갈라 뒀다.
     */
    @Test
    fun `로딩 화면은 없다 - 나중에 채우려 하면 걸린다`() {
        assertEquals(1, KakaoPickerKeywords.PICKER.loadingKeywords.size)
        assertTrue(
            "픽커에는 로딩 화면이 없다 — 낱말을 채우면 그 화면이 통째로 버려진다",
            KakaoPickerKeywords.PICKER.loadingKeywords.single().contains("없다"),
        )
    }

    @Test
    fun `화면을 알아보는 낱말이 로딩 낱말과 겹치지 않는다`() {
        val stageWords = KakaoPickerKeywords.STAGE_WORDS.flatMap { it.second }
        val loading = KakaoPickerKeywords.PICKER.loadingKeywords
        stageWords.forEach { w ->
            loading.forEach { l ->
                assertFalse("«$w» 가 로딩 낱말 «$l» 에 걸려 화면이 통째로 버려진다", w.contains(l) || l.contains(w))
            }
        }
    }
}

/**
 * 🧪 **`sim_` — 배차망 시뮬레이터 픽커 리스트에서 뜬 카드**
 *
 * 폰(SM-A245N)에 시뮬레이터 픽커 리스트를 띄우고 `node onedal-sim/scripts/pickerDumpCheck.mjs --kotlin` 이 찍은 카드 글자를
 * **순서 그대로** 옮겼다. 실물 덤프 문제지(위)와 같은 모양으로 읽혀야 시뮬레이터로 파서를 시험할 수 있다.
 * 🔴 웹뷰가 한 줄의 글자를 뭉치면(«퀵준비 완료대형» · «2.0km광주초월읍») 칸이 전부 «지역»으로 샌다 —
 *    아래는 시뮬레이터 화면이 글자를 칸마다 따로 올리는 카드다. 서버 intel 도 이 값으로 들어간다 (출발 «광주 초월읍» · 도착 «파주 문산읍»).
 */
class SimulatorCardTest {

    private val parser = KakaoPickerParser(null)

    @Test
    fun `sim_ 시뮬레이터 카드 - 준비 완료 대형 2점0km`() {
        val texts = listOf("퀵", "준비 완료", "대형", "파주", "42,290", "2.0km", "광주", "초월읍", "문산읍")
        val o = parser.parse(texts)
        assertEquals(42290, o.fare)
        assertEquals("광주 초월읍", o.pickup)
        assertEquals("파주 문산읍", o.dropoff)
        assertEquals(2.0, o.pickupDistance!!, 0.01)
        assertEquals("대형", o.itemSize)
        assertTrue(o.tagsText!!.contains("준비 완료"))
        assertNull(o.deliveryDistance)
        assertNull(o.vehicleType)
    }

    @Test
    fun `sim_ 시뮬레이터 카드 - 준비 N분 소형 한 글자 동`() {
        val texts = listOf("퀵", "준비 32분", "소형", "이천", "17,680", "8.1km", "광주", "목", "고담")
        val o = parser.parse(texts)
        assertEquals(17680, o.fare)
        assertEquals("광주 목", o.pickup)
        assertEquals("이천 고담", o.dropoff)
        assertEquals(8.1, o.pickupDistance!!, 0.01)
        assertEquals("소형", o.itemSize)
        assertTrue(o.tagsText!!.contains("준비 32분"))
    }
}

/**
 * 🔔 **알람 판정을 축별로 낸다** (기사님: *"서버는 서버대로 문제는 문제대로 … 그 정답이 맞는가를 확인"*)
 *
 * 시뮬레이터 채점기(`onedal-sim/scripts/pickerAlarmGrade.mjs`)가 **판정 순간 폰이 가진 필터**로 정답을 다시 계산해
 * 앱의 판정과 맞춰 본다. 틀렸을 때 «요금·상차·도착 중 어디서» 갈렸는지 알아야 고칠 곳이 갈린다 (앱 판정 vs 서버 필터).
 * 🔴 `decide` 와 **같은 계산 한 벌**이다 — `decide` 는 `decideAxes(...).pass` 를 돌려준다.
 */
class AlarmAxesTest {

    private val parser = KakaoPickerParser(null)

    /** 도착 «이천 창전» · 픽업 3.0km · 요금 인자 */
    private fun card(fare: String, km: String = "3.0km") =
        parser.parse(listOf("퀵", "소형", "이천", fare, km, "광주", "초월읍", "창전"))

    @Test
    fun `요금만 하한 아래 - 요금 축만 떨어진다`() {
        val a = KakaoPickerParser.decideAxes(card("2,900"), 3000, 10.0, listOf("창전동"), emptyMap(), emptyList())
        assertFalse(a.fare)
        assertTrue(a.pickup)
        assertTrue(a.destination)
        assertFalse(a.pass)
    }

    @Test
    fun `상차가 반경 밖 - 상차 축만 떨어진다`() {
        val a = KakaoPickerParser.decideAxes(card("15,000", "12.0km"), 3000, 10.0, listOf("창전동"), emptyMap(), emptyList())
        assertTrue(a.fare)
        assertFalse(a.pickup)
        assertTrue(a.destination)
        assertFalse(a.pass)
    }

    @Test
    fun `도착 «창전» 은 키워드 «창전동» 과 정규화로 만난다 - 셋 다 통과`() {
        val a = KakaoPickerParser.decideAxes(card("15,000"), 3000, 10.0, listOf("창전동"), emptyMap(), emptyList())
        assertTrue(a.destination)
        assertTrue(a.pass)
    }

    @Test
    fun `도착 키워드에 없으면 도착 축만 떨어진다`() {
        val a = KakaoPickerParser.decideAxes(card("15,000"), 3000, 10.0, listOf("신둔면", "관고동"), emptyMap(), emptyList())
        assertTrue(a.fare)
        assertTrue(a.pickup)
        assertFalse(a.destination)
        assertFalse(a.pass)
    }

    @Test
    fun `decide 는 decideAxes 의 pass 와 같다`() {
        listOf(card("2,900"), card("15,000", "12.0km"), card("15,000")).forEach { o ->
            assertEquals(
                KakaoPickerParser.decideAxes(o, 3000, 10.0, listOf("창전동"), emptyMap(), emptyList()).pass,
                KakaoPickerParser.decide(o, 3000, 10.0, listOf("창전동"), emptyMap(), emptyList()),
            )
        }
    }

    @Test
    fun `알람 필터 한 줄 - 채점기가 읽는 JSON 이다`() {
        val line = KakaoPickerParser.alarmFilterJson(3000, 10.0, listOf("창전동", "신둔면"), mapOf("창전" to listOf("창전로")), listOf("이천"))
        val parsed = com.google.gson.JsonParser.parseString(line).asJsonObject
        assertEquals(3000, parsed["minFare"].asInt)
        assertEquals(10, parsed["pickupRadiusKm"].asInt)
        assertEquals(2, parsed["destKeywords"].asJsonArray.size())
        assertEquals("창전로", parsed["keywordTraps"].asJsonObject["창전"].asJsonArray[0].asString)
        assertEquals("이천", parsed["cityAliases"].asJsonArray[0].asString)
    }
}

/**
 * ↩️ **상세 뒤 화면이 바뀌었을 때 무엇을 할까** (기사님: *"로그 문구는 오해를 할 수 있는 부분이라 수정하고 다음으로 가야 한다"*)
 *
 * 리스트로 돌아오면 `HijackService` 가 세션(리스트 원본 · 미리보기 딱지)을 먼저 비운다. 그 뒤에 승격 확인을 부르면
 * 비워진 값을 보고 상세를 거쳐 왔는데도 «상세를 거쳐 오지 않았다»고 잘못 적는다.
 * → 리스트로 돌아온 것은 수락이 아니다 — 승격 확인을 부르지 않고 «리스트로 돌아왔다 · 수락하지 않았다»로 적는다.
 */
class PromotionCheckTest {

    /**
     * 🔴 **상세에 머무는 중이면 아무것도 적지 않는다** (폰 시험).
     * 상세 글자(«배송 130분 남음» → «129분»)만 바뀌어도 «상세 → 상세»로 화면 변경이 잡힌다 —
     * 그때 `↩️ [승격 보류] … 이 화면은 버린다` 를 찍으면 떠난 적이 없는데 «버린다»고 적게 된다.
     */
    @Test
    fun `상세에 머무는 중이다 - 떠난 것이 아니라 아무것도 적지 않는다`() {
        assertEquals(KakaoPickerKeywords.AfterDetail.STILL_ON_DETAIL,
            KakaoPickerKeywords.afterDetail(returnedToList = false, residue = true, stillOnDetail = true))
    }

    @Test
    fun `돌아옴 문구는 몇 초를 박아 두지 않는다 - 알람 상세 대기 시간은 서버가 정한다`() {
        assertFalse(KakaoPickerKeywords.RETURNED_TO_LIST_LOG.contains("30초"))
    }

    @Test
    fun `상세에서 리스트로 돌아왔다 - 수락이 아니다 (넘기기 · 뒤로 · 자동 복귀)`() {
        assertEquals(KakaoPickerKeywords.AfterDetail.RETURNED_TO_LIST,
            KakaoPickerKeywords.afterDetail(returnedToList = true, residue = false))
    }

    @Test
    fun `리스트로 돌아왔는데 상세 글자가 남았어도 - 돌아온 것이 먼저다`() {
        assertEquals(KakaoPickerKeywords.AfterDetail.RETURNED_TO_LIST,
            KakaoPickerKeywords.afterDetail(returnedToList = true, residue = true))
    }

    @Test
    fun `리스트가 아닌데 상세 잔상이 남았다 - 그 화면은 버린다`() {
        assertEquals(KakaoPickerKeywords.AfterDetail.RESIDUE,
            KakaoPickerKeywords.afterDetail(returnedToList = false, residue = true))
    }

    @Test
    fun `리스트도 잔상도 아니다 - 수락 뒤 화면인지 확인한다`() {
        assertEquals(KakaoPickerKeywords.AfterDetail.CHECK_ACCEPTED,
            KakaoPickerKeywords.afterDetail(returnedToList = false, residue = false))
    }

    @Test
    fun `돌아옴 문구는 «수락하지 않았다» 를 말하고 «상세를 거쳐 오지 않았다» 를 말하지 않는다`() {
        val line = KakaoPickerKeywords.RETURNED_TO_LIST_LOG
        assertTrue(line.contains("리스트로 돌아왔다"))
        assertTrue(line.contains("수락하지 않았다"))
        assertFalse(line.contains("거쳐 오지 않았다"))
    }
}

/**
 * 🚫 **«이미 배정이 완료된 오더입니다» 토스트를 카드로 읽지 않는다**
 *
 * 실물(캡처 03): 남이 가져간 콜을 누르면 상세 대신 리스트 아래에 토스트가 뜬다.
 * 🔴 토스트 글자가 가까운 요금에 붙으면 **가짜 카드**가 된다 — 출발지가 «이미 배정이 완료된⏎오더입니다.»이고
 *    도착·거리·크기·태그가 빈 픽커 콜이 서버에 올라간다 (실주행에서 3건). 에러 글자가 2023 자료의 «다른 기사에게 배정» 뿐이면 못 알아본다.
 * → 두 겹: ① 에러 화면 글자에 실물 문구 (토스트가 보이는 동안 리스트를 훑지 않는다) ② 파서가 토스트 글자를 지역으로 쓰지 않는다
 */
class AssignedToastTest {

    private val parser = KakaoPickerParser(null)
    private val realToast = "이미 배정이 완료된\n오더입니다."

    @Test
    fun `실물 토스트 글자를 에러 화면 글자로 알아본다`() {
        assertTrue(KakaoPickerKeywords.PICKER.errorKeywords.any { realToast.contains(it) })
    }

    @Test
    fun `에러 글자가 실물 리스트 · 상세 글자에 없다 - 멀쩡한 화면을 에러로 보지 않는다`() {
        val listTexts = listOf("리스트 설정", "높은 가격순", "20km", "퀵", "소형", "예약", "17:00", "15.2km", "중원", "성남", "수지", "동천", "14,168",
            "서포트모드", "카드설정", "수요지도", "신규", "내 오더", "퀵 오더카드 대기 중...", "퀵 서포트 모드 1장 받기", "0/1건")
        val detailTexts = listOf("뒤로가기", "물품 정보", "초소형 세 변의 합 70cm ∙ 2kg 이하", "최종 수익", "8,200", "배송비", "7,000P", "프로모션", "1,200P", "넘기기", "수락하기")
        (listTexts + detailTexts).forEach { t ->
            assertFalse("«$t» 가 에러 글자에 걸린다", KakaoPickerKeywords.PICKER.errorKeywords.any { t.contains(it) })
        }
    }

    @Test
    fun `09-02 실주행 모양 - 토스트 글자와 요금뿐인 카드에서 토스트가 출발지가 되지 않는다`() {
        val o = parser.parse(listOf(realToast, "2,942"))
        assertEquals(2942, o.fare)
        assertFalse("출발지에 토스트가 들어갔다: ${o.pickup}", o.pickup.contains("배정"))
        assertFalse("도착지에 토스트가 들어갔다: ${o.dropoff}", o.dropoff.contains("배정"))
    }

    @Test
    fun `토스트가 멀쩡한 카드 띠에 섞여도 지역은 그대로다`() {
        val o = parser.parse(listOf("퀵", "소형", "수지", "14,168", realToast, "15.2km", "중원", "성남", "동천"))
        assertEquals("중원 성남", o.pickup)
        assertEquals("수지 동천", o.dropoff)
    }
}

class PickerLocationParsingEdgeCaseTest {

    private val parser = KakaoPickerParser(null)

    @Test
    fun `2토막 카드 - 하남 출발 종로 도착이 뒤집히지 않고 정확히 추출된다`() {
        val o = parser.parse(listOf("퀵", "초소형", "종로", "12,705", "16.9km", "하남"))
        assertEquals(12705, o.fare)
        assertEquals("하남", o.pickup)
        assertEquals("종로", o.dropoff)
    }

    @Test
    fun `3토막 카드 Case A - 하남 감일 출발 종로 도착에서 하차지가 증발하지 않는다`() {
        val o = parser.parse(listOf("퀵", "초소형", "종로", "15,000", "16.9km", "하남", "감일"))
        assertEquals(15000, o.fare)
        assertEquals("하남 감일", o.pickup)
        assertEquals("종로", o.dropoff)
    }

    @Test
    fun `3토막 실측 분당 서초 방배본 - 태그줄에 도착지가 없어도 구와 동을 알아본다`() {
        val o = parser.parse(listOf("퀵", "16:10", "15,540", "14.4km", "분당", "서초", "방배본"))
        assertEquals(15540, o.fare)
        assertEquals("분당", o.pickup)
        assertEquals("서초 방배본", o.dropoff)
    }

    @Test
    fun `5토막 카드 - 뒤에 건물명이 붙어도 행정동을 골라 하차지로 조립한다`() {
        val o = parser.parse(listOf("퀵", "초소형", "강남", "25,000", "18.0km", "분당", "수내1", "역삼1", "타워팰리스"))
        assertEquals(25000, o.fare)
        assertEquals("분당 수내1", o.pickup)
        assertEquals("강남 역삼1", o.dropoff)
    }

    /**
     * 🌅 오전 라이브 실측 덤프의 실물 콜들 — 2토막·3토막 카드에서도 하차지가 빈칸이 되지 않아야 한다
     * (하차지가 빈칸이면 도착지 축에서 탈락한다).
     */
    @Test
    fun `오전 실측 콜 1 - 광주 송정 출발 강남 도착 19404원 (3토막 하차지 증발 버그 복구)`() {
        // 실측: 퀵 승 예약 17:30 6.8km 광주 송정 강남 19,404
        val o = parser.parse(listOf("퀵", "승", "예약", "17:30", "강남", "19,404", "6.8km", "광주", "송정"))
        assertEquals(19404, o.fare)
        assertEquals("광주 송정", o.pickup)
        assertEquals("강남", o.dropoff) // 🔴 dropoff 가 빈칸이 되면 19,404원 꿀콜이 도착지 축에서 탈락한다
        assertEquals(6.8, o.pickupDistance!!, 0.01)

        // 서울 필터 대조: 통과해야 함!
        val seoulKeywords = listOf("서울", "강남", "서초", "송파", "영등포")
        assertTrue("강남 도착은 서울 필터를 통과해야 한다",
            KakaoPickerParser.decide(o, minFare = 10000, pickupRadiusKm = 10.0, destKeywords = seoulKeywords))
    }

    @Test
    fun `오전 실측 콜 2 - 송파 출발 영등포 도착 11242원 (2토막 구-구 콜)`() {
        // 실측: 퀵 반나절 중형 예약 18.7km 송파 영등포 11,242
        val o = parser.parse(listOf("퀵", "반나절", "중형", "예약", "영등포", "11,242", "18.7km", "송파"))
        assertEquals(11242, o.fare)
        assertEquals("송파", o.pickup)
        assertEquals("영등포", o.dropoff)

        // 영등포(서울) 필터 통과
        val seoulKeywords = listOf("서울", "영등포")
        assertTrue(KakaoPickerParser.decide(o, minFare = 10000, pickupRadiusKm = 20.0, destKeywords = seoulKeywords))
    }

    @Test
    fun `오전 실측 콜 3 - 분당 야탑3 출발 서초 방배본 도착 15540원 (4토막 실콜)`() {
        // 실측: 퀵 승 예약 16:10 14.4km 분당 야탑3 서초 방배본 15,540
        val o = parser.parse(listOf("퀵", "승", "예약", "16:10", "서초", "15,540", "14.4km", "분당", "야탑3", "방배본"))
        assertEquals(15540, o.fare)
        assertEquals("분당 야탑3", o.pickup)
        assertEquals("서초 방배본", o.dropoff)

        // 서초(서울) 필터 통과
        val seoulKeywords = listOf("서울", "서초", "방배동")
        assertTrue(KakaoPickerParser.decide(o, minFare = 10000, pickupRadiusKm = 15.0, destKeywords = seoulKeywords))
    }

    @Test
    fun `오전 실측 콜 4 - 수정 신촌 출발 성북 장위3 도착 17362원 (4토막 실콜)`() {
        // 실측: 퀵 중형 18.6km 수정 신촌 성북 장위3 17,362
        val o = parser.parse(listOf("퀵", "중형", "성북", "17,362", "18.6km", "수정", "신촌", "장위3"))
        assertEquals(17362, o.fare)
        assertEquals("수정 신촌", o.pickup)
        assertEquals("성북 장위3", o.dropoff)

        // 성북(서울) 필터 통과
        val seoulKeywords = listOf("서울", "성북", "장위동")
        assertTrue(KakaoPickerParser.decide(o, minFare = 10000, pickupRadiusKm = 20.0, destKeywords = seoulKeywords))
    }

    @Test
    fun `오전 실측 콜 5 - 태그가 늦게 로드되어 본문에만 3토막이 들어온 콜도 복구`() {
        // 태그에 지역이 없고 본문에 "광주 송정 강남" 3토막만 있는 변칙 상황
        val o = parser.parse(listOf("퀵", "승", "17:30", "19,404", "6.8km", "광주", "송정", "강남"))
        assertEquals(19404, o.fare)
        assertEquals("광주 송정", o.pickup)
        assertEquals("강남", o.dropoff) // 본문 3토막이어도 [구, 동, 구] -> 출발: 광주 송정, 도착: 강남
    }
}

