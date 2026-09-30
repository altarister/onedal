package com.onedal.app.plugins.kakaopicker

import com.onedal.app.core.CallMemory
import com.onedal.app.core.ListSightings
import com.onedal.app.models.SimplifiedOfficeOrder
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Before
import org.junit.Test

/**
 * 🧾 **같은 콜이 요금만 오르면 마지막에 본 줄** — 라이브 09-30 19:40:38 손 상세 «상차 맞음 8 · km 맞음 4 · 다른 콜 4 → 요금 없음».
 * 폰 목록 줄: 19:39:13 «중원 성남 → 수정 수진2 · 14.9km · 4,000» → 19:39:44 같은 자리 «4,100» → 19:39:59 «이미 본 콜 4,100».
 * 한 읽기에 한 벌씩만 떴다(함께 뜬 적 없음) — 픽커가 분 단위로 요금을 올린다.
 * 사진은 «퀵 단거리» 매장 오더라 «최종 수익»이 시트 아래로 밀려 안 보였다 — 목록 요금이 유일한 요금이다.
 * ⚠️ 한계: 마지막에 본 목록 값이라 그 뒤 픽커가 더 올렸으면 판정 요금이 조금 낮다(최종 수익이 화면 밖인 모양에서만).
 */
class PickerSameCallTest {
    @Before @After fun clear() = ListSightings.clear()

    private fun card(fare: Int, pickup: String = "중원 성남", dropoff: String = "수정 수진2") =
        SimplifiedOfficeOrder(id = "c$fare", pickup = pickup, dropoff = dropoff, fare = fare, timestamp = "t", pickupDistance = 14.9)
    private fun saw(o: SimplifiedOfficeOrder, vararg scans: Long) = scans.forEach { ListSightings.saw(CallMemory.fingerprintOf(o), it) }

    /** 사진 ok_1790764839089.jpg 의 두 정류장 */
    private val pickupStop = PickerStopFromImage("경기 성남시 중원구 성남동", "싹싹김치찜-성남본점", 14.9, "20:02까지")
    private val dropoffStop = PickerStopFromImage("경기 성남시 수정구 수진2동", null, 1.3, "20:14까지")

    @Test fun `같은 콜이 요금만 올랐다 - 사진 대조는 마지막에 본 4,100`() {
        val a = card(4000); val b = card(4100)
        saw(a, 7); saw(b, 9, 10)
        assertEquals(4100, KakaoPickerParser.photoMatchCard(pickupStop, dropoffStop, listOf(a, b))?.fare)
    }

    @Test fun `같은 콜이 요금만 올랐다 - 상세 글 대조도 같은 함수`() {
        val a = card(4000); val b = card(4100)
        saw(a, 7); saw(b, 9, 10)
        val m = KakaoPickerParser.matchListCard(listOf("픽업지 경기 성남시 중원구 성남동 싹싹김치찜-성남본점", "픽업 장소", "매장 직원에게 문의"), listOf(a, b))
        assertEquals(4100, m.card?.fare)
    }

    @Test fun `한 화면에 함께 뜬 적이 있으면 다른 콜 - 고르지 않는다`() {
        val a = card(4000); val b = card(4100)
        saw(a, 7, 8); saw(b, 8, 9)
        assertNull(KakaoPickerParser.photoMatchCard(pickupStop, dropoffStop, listOf(a, b)))
    }

    @Test fun `본 적이 안 적힌 줄이 섞이면 고르지 않는다`() {
        val a = card(4000); val b = card(4100)
        saw(b, 9)
        assertNull(KakaoPickerParser.photoMatchCard(pickupStop, dropoffStop, listOf(a, b)))
    }
}

/**
 * 🧩 **같은 콜을 동 없이 읽은 줄은 합친다** — 라이브 09-30 20:47:56 손 상세
 * «후보 10,920(분당 삼평→강남 일원본 16.5km) · 10,920(분당→강남 16.5km)» → 요금 없음으로 버렸다(덜 그려진 카드가 동 없이 읽힘).
 * 요금·km 가 같고 한 줄의 토막이 다른 줄의 부분집합이면 토막이 많은 줄 하나로(합쳐도 고르는 요금이 틀릴 수 없다).
 */
class PickerPartialRowMergeTest {
    @Before @After fun clear() = ListSightings.clear()

    private fun card(pickup: String, dropoff: String) =
        SimplifiedOfficeOrder(id = "$pickup$dropoff", pickup = pickup, dropoff = dropoff, fare = 10920, timestamp = "t", pickupDistance = 16.5)
    private val pickupStop = PickerStopFromImage("경기 성남시 분당구 삼평동", null, 16.5, null)
    private val dropoffStop = PickerStopFromImage("서울 강남구 일원본동", null, 3.0, null)

    @Test fun `동 없이 읽은 줄은 합친다 - 20시47분56초 두 후보`() {
        val full = card("분당 삼평", "강남 일원본"); val partial = card("분당", "강남")
        assertEquals("분당 삼평", KakaoPickerParser.photoMatchCard(pickupStop, dropoffStop, listOf(full, partial))?.pickup)
        assertEquals(true, KakaoPickerParser.photoMatchReport(pickupStop, dropoffStop, listOf(full, partial)).contains("같은 콜을 동 없이 읽은 줄 합침"))
    }

    @Test fun `서로 부분집합이 아니면 합치지 않는다 - 안 고름`() =
        assertNull(KakaoPickerParser.photoMatchCard(pickupStop, dropoffStop, listOf(card("분당 삼평", "강남"), card("분당", "강남 일원본"))))
}
