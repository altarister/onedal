package com.onedal.app.plugins.kakaopicker

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * 🗳️ **떨어진 까닭을 장부에 남긴다** (기사님 지시).
 *
 * 탈락한 콜도 원문과 함께 장부에 들어간다. 어느 축에서 떨어졌는지를 함께 남겨야 «왜 이 콜이 안 울렸나» 를
 * 장부에서 되짚을 수 있다 — 폰 로그는 3일치뿐이다.
 *
 * 픽커는 콜을 잡지 않지만 **알람 판정**이 요금 · 상차거리 · 도착지 세 축으로 가르므로, `withVerdict` 가 그 축을 싣는다.
 *
 * 🔴 **성적표와 같은 분기를 쓴다** — 따로 세면 «성적표는 요금, 장부는 지역» 으로 갈라진다
 *    (`InsungParser.withVerdict` 가 `judge(...).axis` 한 줄인 까닭).
 * 🔴 **축 낱말은 서버가 쓰는 말 그대로** — `fare` · `pickup` · `region` (`simScenario.ts` 의 `blockBy`).
 * 🔴 **통과한 콜에는 안 싣는다** — 판정 칸이 비어 있으면 «통과» 라는 뜻이다.
 */
class PickerVerdictTest {

    private val parser = KakaoPickerParser(null)

    /** 실물 원문: «퀵 초소형 15.8km 분당 정자3 만안 안양7 11,910» */
    private fun call(fare: Int, km: Double?, dropoff: String) =
        parser.parse(
            listOfNotNull(
                "퀵", "초소형", km?.let { "${it}km" }, "분당", "정자3",
                dropoff.split(' ').getOrNull(0), dropoff.split(' ').getOrNull(1),
                "%,d".format(fare),
            ),
        )

    @Test
    fun `요금이 모자라면 fare 를 남긴다`() {
        val o = call(3000, 15.8, "만안 안양7")
        assertEquals("fare", KakaoPickerParser.verdictAxisOf(o, minFare = 8000, pickupRadiusKm = 20.0, destKeywords = emptyList()))
    }

    @Test
    fun `상차가 멀면 pickup 을 남긴다`() {
        val o = call(12000, 30.0, "만안 안양7")
        assertEquals("pickup", KakaoPickerParser.verdictAxisOf(o, minFare = 8000, pickupRadiusKm = 20.0, destKeywords = emptyList()))
    }

    @Test
    fun `도착지가 그물 밖이면 region 을 남긴다`() {
        val o = call(12000, 15.8, "만안 안양7")
        assertEquals("region", KakaoPickerParser.verdictAxisOf(o, minFare = 8000, pickupRadiusKm = 20.0, destKeywords = listOf("역삼동")))
    }

    @Test
    fun `🔴 통과한 콜에는 안 싣는다 - 빈 칸이 «통과» 라는 뜻이다`() {
        val o = call(12000, 15.8, "만안 안양7")
        assertNull(KakaoPickerParser.verdictAxisOf(o, minFare = 8000, pickupRadiusKm = 20.0, destKeywords = emptyList()))
    }

    /** 🔴 요금·상차가 다 걸려도 **하나만** 고른다 — 성적표가 «첫 번째로 걸린 축» 만 세는 것과 같은 규칙 */
    @Test
    fun `여러 축이 걸리면 첫 축 하나만 남긴다`() {
        val o = call(3000, 30.0, "만안 안양7")
        assertEquals("fare", KakaoPickerParser.verdictAxisOf(o, minFare = 8000, pickupRadiusKm = 20.0, destKeywords = emptyList()))
    }
}
