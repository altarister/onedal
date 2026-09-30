package com.onedal.app.plugins.kakaopicker

import com.onedal.app.models.SimplifiedOfficeOrder
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * 🧾 **손으로 연 상세 — 목록 대조가 못 가르면 사진의 상차·하차·픽업 km 로 한 번 더** (실물 09-30 13:14:47 · 13:14:22).
 * 올리브영처럼 한 매장 오더가 같이 나오면 상차가 같은 줄이 여럿이다 — 상세 글자에는 하차가 없어 못 갈랐고 요금이 0 이 됐다.
 * 🔴 꼭 한 줄일 때만 요금을 가져온다 — 아니면 지금처럼 버린다(추측하지 않는다).
 */
class PickerPhotoMatchTest {
    private fun card(p: String, d: String, fare: Int, km: Double?) =
        SimplifiedOfficeOrder(id = "$p$d$fare", pickup = p, dropoff = d, fare = fare, timestamp = "t", pickupDistance = km)
    private fun stop(admin: String, place: String?, km: Double) = PickerStopFromImage(admin, place, km, null)
    private fun photo(p: PickerStopFromImage, d: PickerStopFromImage) = PickerDetailFromImage(p, d, "소형", false)

    private val iCheon = listOf(
        card("이천 중리", "이천 증포", 3364, 17.3),
        card("이천 중리", "이천 부발", 4100, 17.3),
        card("수정 위례", "송파 위례", 2979, 16.7),
    )

    @Test fun `이천 - 같은 매장 둘 중 하차로 한 줄`() {
        val p = photo(stop("경기 이천시 중리동", "올영 이천터미널점", 17.3), stop("경기 이천시 증포동", null, 2.1))
        val r = PickerDetailOcrParser().verify(p, null, null, emptyList(), "", iCheon) as PickerDetailOcrParser.VerifyResult.Success
        assertEquals(3364, r.order.fare)
    }

    @Test fun `위례 - 행정동 주소로 한 줄`() {
        val p = photo(stop("경기 성남시 수정구 위례동", "올영 성남위례점", 16.7), stop("서울 송파구 위례동", "위례포레샤인23단지", 1.2))
        assertEquals(2979, KakaoPickerParser.photoMatchCard(p.pickup, p.dropoff, iCheon)?.fare)
    }

    @Test fun `두 줄이 맞으면 고르지 않는다 - 요금 0 그대로`() {
        val twins = iCheon + card("이천 중리", "이천 증포", 5000, 17.4)
        val p = photo(stop("경기 이천시 중리동", "올영 이천터미널점", 17.3), stop("경기 이천시 증포동", null, 2.1))
        assertNull(KakaoPickerParser.photoMatchCard(p.pickup, p.dropoff, twins))
    }

    @Test fun `픽업 km 가 0점3 넘게 다르면 아니다`() {
        val p = photo(stop("경기 이천시 중리동", null, 18.0), stop("경기 이천시 증포동", null, 2.1))
        assertNull(KakaoPickerParser.photoMatchCard(p.pickup, p.dropoff, iCheon))
    }
}
