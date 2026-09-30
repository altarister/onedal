package com.onedal.app.plugins.kakaopicker

import com.onedal.app.core.CallMemory
import com.onedal.app.core.ListSightings
import com.onedal.app.core.OcrLine
import com.onedal.app.models.SimplifiedOfficeOrder
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

/**
 * 🍷 **같은 가게·같은 경로 쌍둥이 콜 — 최종 수익이 화면 밖이면 낮은 요금** (기사님 «가» · onedal-1f).
 * 라이브 09-30 20:11:43 «송파 문정2동 와인마트 문정점 → 하남 감북동» — 목록에 «19.6km · 퀵 반나절 승 예약 내일» 7,238 · 6,160 이 한 화면에 함께.
 * 유의사항이 길어 «최종 수익»이 시트 아래라 요금을 못 읽었고, 어느 콜인지 몰라 «요금 없음»으로 버렸다.
 * 사진 줄은 서버 이상 기록 516 그대로(16줄). 순서: 한 줄 → 요금만 오른 같은 콜(최신) → 쌍둥이(낮은 값) → 안 고름.
 */
class PickerTwinCallTest {
    @Before @After fun clear() = ListSightings.clear()

    private val lines = listOf(
        OcrLine(30, "퀵 반나절 승용차 예약"), OcrLine(193, "서울 송파구 문정2동"), OcrLine(235, "와인마트 문정점"),
        OcrLine(286, "경기 하남시 감북동"), OcrLine(326, "드까르멜릿"), OcrLine(428, "물품 정보"), OcrLine(90, "내일 12:20 픽업예약"),
        OcrLine(509, "유의사항"), OcrLine(192, "픽업 19.6km"), OcrLine(221, "내일 12:20"), OcrLine(565, "넘기기"),
        OcrLine(285, "배송 4.5km"), OcrLine(312, "내일 14:56"), OcrLine(429, "중형 세 변의 합 140cm. 20kg 이하"),
        OcrLine(510, "와인 12병 입니다. 부피가 크니 가능한"), OcrLine(567, "수락하기"),
    )
    private fun card(fare: Int, tags: String = "퀵 반나절 승 예약 내일") =
        SimplifiedOfficeOrder(id = "c$fare", pickup = "송파 문정2", dropoff = "하남 감북", fare = fare, timestamp = "t", pickupDistance = 19.6, tagsText = tags)
    private fun saw(o: SimplifiedOfficeOrder, vararg scans: Long) = scans.forEach { ListSightings.saw(CallMemory.fingerprintOf(o), it) }
    private fun verify(recent: List<SimplifiedOfficeOrder>, finalIncome: Int? = null) =
        (PickerDetailOcrParser().verify(PickerScreenOcr.parseDetail(lines)!!.copy(finalIncome = finalIncome), null, null, emptyList(), "", recent)
            as PickerDetailOcrParser.VerifyResult.Success).order

    @Test fun `쌍둥이 콜 - 낮은 요금 · 꼬리 글`() {
        val a = card(7238); val b = card(6160)
        saw(a, 20, 21); saw(b, 20, 21)
        val o = verify(listOf(a, b))
        assertEquals(6160, o.fare)
        assertTrue(o.tagsText.orEmpty(), o.tagsText.orEmpty().endsWith("요금 둘 중 낮은 값 · 7,238 / 6,160"))
    }

    @Test fun `진단 줄 끝 - 같은 경로 요금 둘 낮은 값`() {
        val a = card(7238); val b = card(6160)
        saw(a, 20); saw(b, 20)
        val d = PickerScreenOcr.parseDetail(lines)!!
        val r = KakaoPickerParser.photoMatchReport(d.pickup, d.dropoff, listOf(a, b), fareUnread = true)
        assertTrue(r, r.contains("같은 경로 요금 둘 — 낮은 6,160"))
        assertTrue("못 고를 때 후보를 적는다: $r", r.contains("후보 7,238(송파 문정2→하남 감북 19.6km) · 6,160("))
    }

    @Test fun `태그가 하나라도 다르면 안 고른다`() {
        val a = card(7238); val b = card(6160, tags = "퀵 반나절 소형 예약 내일")
        saw(a, 20); saw(b, 20)
        val d = PickerScreenOcr.parseDetail(lines)!!
        assertNull(KakaoPickerParser.photoMatchCard(d.pickup, d.dropoff, listOf(a, b), fareUnread = true))
    }

    @Test fun `최종 수익을 읽었으면 쌍둥이 길을 안 탄다`() {
        val a = card(7238); val b = card(6160)
        saw(a, 20); saw(b, 20)
        val d = PickerScreenOcr.parseDetail(lines)!!
        assertNull(KakaoPickerParser.photoMatchCard(d.pickup, d.dropoff, listOf(a, b), fareUnread = false))
    }

    private val detailTexts = listOf("픽업지 서울 송파구 문정2동 와인마트 문정점", "픽업 장소", "매장 직원에게 문의")

    @Test fun `목록 길 쌍둥이 - 까닭이 낮은 요금이라 말한다`() {
        val a = card(7238); val b = card(6160)
        saw(a, 20, 21); saw(b, 20, 21)
        val m = KakaoPickerParser.matchListCard(detailTexts, listOf(a, b))
        assertEquals(6160, m.card?.fare)
        assertTrue(m.why, m.why.contains("같은 경로 요금 둘 — 낮은 6,160"))
    }

    @Test fun `목록 길 요금만 오른 같은 콜 - 까닭이 마지막에 본`() {
        val a = card(6160); val b = card(7238)
        saw(a, 5); saw(b, 9)
        val m = KakaoPickerParser.matchListCard(detailTexts, listOf(a, b))
        assertEquals(7238, m.card?.fare)
        assertTrue(m.why, m.why.contains("요금만 다른 같은 콜 — 마지막에 본 7238원"))
    }

    @Test fun `목록 길로 찾은 쌍둥이도 사진 길과 같은 꼬리 글`() {
        val a = card(7238); val b = card(6160)
        saw(a, 20, 21); saw(b, 20, 21)
        val o = (PickerDetailOcrParser().verify(PickerScreenOcr.parseDetail(lines)!!.copy(finalIncome = null), null, b, emptyList(), "", listOf(a, b))
            as PickerDetailOcrParser.VerifyResult.Success).order
        assertEquals(6160, o.fare)
        assertTrue(o.tagsText.orEmpty(), o.tagsText.orEmpty().endsWith("요금 둘 중 낮은 값 · 7,238 / 6,160"))
    }

    @Test fun `함께 뜬 적 없으면 요금만 오른 같은 콜 - 최신 값`() {
        val a = card(6160); val b = card(7238)
        saw(a, 5); saw(b, 9)
        assertEquals(7238, verify(listOf(a, b)).fare)
    }
}
