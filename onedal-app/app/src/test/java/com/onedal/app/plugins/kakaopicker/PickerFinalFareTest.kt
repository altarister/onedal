package com.onedal.app.plugins.kakaopicker

import com.onedal.app.core.CallMemory
import com.onedal.app.models.SimplifiedOfficeOrder
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * 💰 **픽커 상세의 «최종 수익»이 판정 요금이다** (기사님 «가» · onedal-1f).
 * 픽커는 시간이 지나며 요금을 올린다 — 실물 09-30 «중원 상대원1 → 용산 한남»이 13:23 목록 11,396 → 13:25 목록 11,796.
 * 앱이 기억한 목록 줄 요금과 상세의 최종 수익이 달라진다. 판정·서버는 상세 값, 본 콜 기억 지문(목록 줄)은 그대로.
 * 손으로 연 상세가 목록 줄을 «요금이 같은 줄»로만 찾아 못 찾던 것(«손으로 연 상세가 평가 안 된다»)도 같은 뿌리다.
 */
class PickerFinalFareTest {
    private val listCard = SimplifiedOfficeOrder(id = "c", pickup = "중원 상대원1", dropoff = "용산 한남", fare = 11396, timestamp = "t", pickupDistance = 12.7)

    private fun detail(finalIncome: Int?) = PickerDetailFromImage(
        pickup = PickerStopFromImage("경기 성남시 중원구 상대원1동", null, 12.7, null),
        dropoff = PickerStopFromImage("서울 용산구 한남동", null, 9.0, null),
        itemSize = "초소형", reserved = false, finalIncome = finalIncome,
    )

    private fun fareOf(r: PickerDetailOcrParser.VerifyResult) = (r as PickerDetailOcrParser.VerifyResult.Success).order.fare

    @Test fun `알람이 연 상세 - 최종 수익이 판정 요금 · 누른 줄 지문은 그대로`() {
        val before = CallMemory.fingerprintOf(listCard)
        assertEquals(11796, fareOf(PickerDetailOcrParser().verify(detail(11796), listCard, null, emptyList(), "")))
        assertEquals(11396, listCard.fare)
        assertEquals(before, CallMemory.fingerprintOf(listCard))
    }

    @Test fun `알람이 연 상세 - 사진에 최종 수익이 없으면 목록 요금`() =
        assertEquals(11396, fareOf(PickerDetailOcrParser().verify(detail(null), listCard, null, emptyList(), "")))

    @Test fun `손으로 연 상세 - 찾은 목록 줄보다 최종 수익이 먼저`() =
        assertEquals(11796, fareOf(PickerDetailOcrParser().verify(detail(11796), null, listCard, emptyList(), "")))

    /** 실물 상세 노드 꼴(14:29:41 트레이스) — 배송지는 노드에 없다 */
    private val handOpened = listOf("픽업지 경기 성남시 중원구 상대원1동", "물품 정보", "초소형", "최종 수익", "11,796", "넘기기", "수락하기")

    @Test fun `손으로 연 상세 - 최종 수익이 목록 요금과 달라도 픽업지로 목록 줄을 찾는다`() {
        val m = KakaoPickerParser.matchListCard(handOpened, listOf(listCard, listCard.copy(pickup = "수정 신흥2", fare = 11796)))
        assertEquals("중원 상대원1", m.card?.pickup)
        assertTrue(m.why, m.why.contains("요금 달라"))
    }

    @Test fun `요금 없이 찾아도 여럿이면 고르지 않는다 - 추측 금지`() {
        val m = KakaoPickerParser.matchListCard(handOpened, listOf(listCard, listCard.copy(dropoff = "강남 역삼2", fare = 9000)))
        assertNull(m.card)
    }

    /** 🔢 사진 숫자 한 자리 빠짐·붙음(열 배 차이)은 오독으로 본다 — 판정이 열 배 틀리지 않게 (onedal-1f «가») */
    @Test fun `최종 수익이 목록과 열 배 차이면 목록 요금`() {
        val card = listCard.copy(fare = 13020)
        assertEquals(13020, fareOf(PickerDetailOcrParser().verify(detail(1302), card, null, emptyList(), "")))
        assertEquals(13020, fareOf(PickerDetailOcrParser().verify(detail(130200), card, null, emptyList(), "")))
        assertEquals("두 배 인상은 믿는다", 26040, fareOf(PickerDetailOcrParser().verify(detail(26040), card, null, emptyList(), "")))
    }

    @Test fun `목록 요금이 없으면 안전장치 없이 최종 수익`() =
        assertEquals(1302, fareOf(PickerDetailOcrParser().verify(detail(1302), null, null, emptyList(), "")))
}
