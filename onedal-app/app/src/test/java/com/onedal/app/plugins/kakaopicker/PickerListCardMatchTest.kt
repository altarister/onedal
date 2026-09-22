package com.onedal.app.plugins.kakaopicker

import com.onedal.app.models.SimplifiedOfficeOrder
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * 👀 **누가 열었든 픽커 상세는 리스트 카드를 찾아 판정까지 간다** (2026-09-14 폰 시험)
 *
 * 기사님: *"내가 픽업에서 리스트를 클릭했는데.. 관제엡에서는 콜로 인지 하지 않았고 평가 하지 않았어.
 * 내가 손으로 누르면 경로를 찾아서 평가해야 해"*
 *
 * 17:05:38 폰 로그: `👀 [미리보기 보류] 리스트 원본이 없다 — 주소를 지어내지 않는다`.
 * 리스트 카드는 **알람이 누를 때만** 쥐여 줬다 — 손으로 연 상세는 쥔 것이 없어 서버에 아무것도 안 갔다.
 *
 * 🔴 **요금만으로는 못 고른다** — 7지점 문제지에 1만 원 카드가 넷이다 (인성의 «요금이 같은 콜» 역추적이 여기서는 틀린다).
 * 🔴 **실물 픽커는 배송지를 원달앱이 읽는 글자에 안 올린다** (09-13 `83af36b`) — 그래서 픽업지로 먼저 가른다.
 */
class PickerListCardMatchTest {

    private fun card(pickup: String, dropoff: String, fare: Int, itemSize: String? = null) =
        SimplifiedOfficeOrder(id = "", pickup = pickup, dropoff = dropoff, fare = fare, timestamp = "2026-09-14T17:05:00+09:00", itemSize = itemSize)

    /** 09-14 17:05:38 폰 로그 `📄 [상세 실물]` 그대로 — 기사님이 손으로 연 시뮬레이터 상세 */
    private val handOpened = listOf(
        "뒤로가기", "퀵", "배송 154분 남음", "준비 24분 포함", "경기 광주시 초월읍", "모다아울렛 곤지암점",
        "픽업 7.2km", "17:15까지 픽업", "경기 이천시 신둔면", "신둔농협하나로마트 예스파크점", "배송 10.0km",
        "19:40까지 배송", "픽업 장소", "매장 직원에게 문의", "오더번호 260914170513458", "물품 정보", "초소형",
        "세 변의 합 70cm ∙ 2kg 이하", "최종 수익", "10,000", "P", "배송비", "10,000P", "넘기기", "수락하기",
    )

    /** 같은 때 리스트 — 7지점 문제지 카드 (17:06:33 `⏭️ [이미 본 콜]` 로그) */
    private val sevenPoints = listOf(
        card("이천 중리", "광주 초월읍", 10000),
        card("이천 사음", "이천 중리", 10000),
        card("광주 곤지암읍", "이천 관고", 10000),
        card("광주 초월읍", "이천 신둔면", 10000),
        card("이천 중리", "이천 신둔면", 6000),
        card("광주 곤지암읍", "이천 관고", 1000),
        card("광주 초월읍", "이천 중리", 30000),
    )

    @Test
    fun `🔴 손으로 연 상세 - 요금과 픽업지로 리스트 카드 하나를 찾는다 (09-14 17시05분 폰 시험)`() {
        val m = KakaoPickerParser.matchListCard(handOpened, sevenPoints)
        assertEquals("광주 초월읍", m.card?.pickup)
        assertEquals("이천 신둔면", m.card?.dropoff)
        assertEquals(10000, m.card?.fare)
    }

    @Test
    fun `요금만 같은 카드는 고르지 않는다 - 1만 원 카드가 넷이다`() {
        assertEquals(4, sevenPoints.count { it.fare == 10000 })
        val m = KakaoPickerParser.matchListCard(handOpened, sevenPoints.filter { it.pickup != "광주 초월읍" })
        assertNull(m.card)
        assertTrue("못 고른 까닭을 말한다", m.why.isNotBlank())
    }

    @Test
    fun `실물 픽커 - 배송지가 글자에 없어도 픽업지로 찾는다 (구·동 줄임 표기)`() {
        val real = listOf("뒤로가기", "퀵", "경기 성남시 중원구 성남동", "위례역푸르지오", "픽업 2.9km", "최종 수익", "7,280", "넘기기", "수락하기")
        val m = KakaoPickerParser.matchListCard(real, listOf(card("수정 태평", "중원 성남", 7280), card("중원 성남", "수정 신흥2", 7280)))
        assertEquals("중원 성남", m.card?.pickup)
        assertEquals("수정 신흥2", m.card?.dropoff)
    }

    @Test
    fun `같은 픽업지·요금 카드가 둘이면 배송지로 가른다 (시뮬레이터 상세에는 배송지가 있다)`() {
        val m = KakaoPickerParser.matchListCard(handOpened, listOf(card("광주 초월읍", "이천 중리", 10000), card("광주 초월읍", "이천 신둔면", 10000)))
        assertEquals("이천 신둔면", m.card?.dropoff)
    }

    @Test
    fun `🔴 가를 수 없으면 고르지 않는다 - 지어내지 않는다 (규칙 ④)`() {
        val real = listOf("경기 성남시 중원구 성남동", "픽업 2.9km", "최종 수익", "7,280", "넘기기", "수락하기")
        val m = KakaoPickerParser.matchListCard(real, listOf(card("중원 성남", "수정 태평", 7280), card("중원 성남", "수정 신흥2", 7280)))
        assertNull(m.card)
        assertTrue(m.why.contains("2"))
    }

    @Test
    fun `같은 카드가 두 번 들어 있어도 한 장이다 (리스트를 여러 번 읽는다)`() {
        val m = KakaoPickerParser.matchListCard(handOpened, listOf(card("광주 초월읍", "이천 신둔면", 10000), card("광주 초월읍", "이천 신둔면", 10000)))
        assertEquals("이천 신둔면", m.card?.dropoff)
    }

    /**
     * 🔴 **실물 픽커 상세는 «최종 수익»을 읽는 글자에 안 올린다** (09-16 04:49 라이브 · «👀 미리보기 보류 — 최종 수익을 못 읽었다»).
     * 요금은 리스트 카드에 있다 — 상세에서 읽히는 픽업지(+물품 크기)로 카드 한 장을 찾고, 요금은 카드 것을 쓴다.
     * 못 찾은 콜은 보내지 않는다 (기사님: «못 찾은 콜은 내 콜이 아닌 거지»).
     */
    @Test
    fun `최종 수익을 못 읽으면 픽업지로 찾고 여럿이면 배송지로 가른다`() {
        val noFare = handOpened.filter { it != "최종 수익" && it != "10,000" && it != "10,000P" }
        val m = KakaoPickerParser.matchListCard(noFare, sevenPoints)
        assertEquals("광주 초월읍", m.card?.pickup)
        assertEquals("이천 신둔면", m.card?.dropoff)
        assertEquals(10000, m.card?.fare)
    }

    /** 🟢 09-16 04:49:44 실물 라이브 `📄 [상세 실물]` 그대로 (요금 · 배송지 · 거리가 안 읽혔다) */
    private val liveDetail = listOf(
        "픽업지", "경기 성남시 수정구 위례동", "kotlin.Unit", "물품 정보", "소형 세 변의 합 100cm ∙ 5kg 이하",
        "유의사항", "케이크입니다. 파손되지 않게 잘 부탁드립니다.", "넘기기", "수락하기",
    )

    /** 🟢 같은 때(04:35) 실물 리스트 카드 — «수정 위례» 카드에는 크기 글자가 없다(«퀵 승 예약 20:00») */
    private val liveList = listOf(
        card("수정 위례", "도봉 창3", 20790),
        card("광주 송정", "강남 역삼1", 19404),
        card("분당 백현", "영등포 여의", 16632),
        card("분당 운중", "광진 광장", 13706, "소형"),
        card("분당 정자1", "하남 감일", 13552, "중형"),
        card("하남 위례", "강남 청담", 10780),
    )

    @Test
    fun `🔴 실물 라이브 - 요금 없이 픽업지로 한 장을 찾는다 · 요금은 리스트 카드 것 (09-16 04시49분)`() {
        val m = KakaoPickerParser.matchListCard(liveDetail, liveList)
        assertEquals("수정 위례", m.card?.pickup)
        assertEquals(20790, m.card?.fare)
        assertTrue("요금 없이 찾았다고 말한다", m.why.contains("요금 없이"))
    }

    @Test
    fun `요금 없이 - 같은 픽업지가 둘이면 물품 크기로 가른다 · 크기를 모르는 카드는 빼지 않는다`() {
        val m = KakaoPickerParser.matchListCard(liveDetail, listOf(card("수정 위례", "도봉 창3", 20790, "중형"), card("수정 위례", "강남 역삼1", 9000, "소형")))
        assertEquals(9000, m.card?.fare)
        val unknownSize = KakaoPickerParser.matchListCard(liveDetail, listOf(card("수정 위례", "도봉 창3", 20790, "중형"), card("수정 위례", "강남 역삼1", 9000)))
        assertEquals("크기가 다른 카드만 빼고, 모르는 카드는 남긴다", 9000, unknownSize.card?.fare)
    }

    @Test
    fun `🔴 요금 없이 - 픽업지 · 크기까지 같은 카드가 둘이면 고르지 않는다`() {
        val m = KakaoPickerParser.matchListCard(liveDetail, listOf(card("수정 위례", "도봉 창3", 20790, "소형"), card("수정 위례", "강남 역삼1", 9000, "소형")))
        assertNull(m.card)
        assertTrue(m.why.contains("2"))
    }
}
