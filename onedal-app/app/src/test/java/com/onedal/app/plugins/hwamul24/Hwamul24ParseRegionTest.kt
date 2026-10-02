package com.onedal.app.plugins.hwamul24

import android.content.ContextWrapper
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Test

/**
 * 🗺️ **화물24시 목록 — 지역 후보에 주소만 든다** (onedal-69 ⓑ)
 *
 * 차종 줄(«오토바이/전체서류봉투»)·결제 글(«무과세» · «계산서»)·아래 막대(«🚚 배차내역»)가 지역 후보로 들어가면
 * 하차가 «서류봉투» · «무과세», 상차가 «배차내역»으로 잡힌다. 주소에는 «/» 가 없다 — «/» 가 든 글(차종 줄 · 화물 글)은 지역이 아니다.
 * 🔴 실물 캡처 답은 고치기 전에 잰 답 그대로여야 한다.
 */
class Hwamul24ParseRegionTest {
    private val parser = Hwamul24Parser(ContextWrapper(null))
    private fun parse(vararg texts: String) = parser.parse(texts.toList())

    @Test fun `실물 캡처 17 - 답이 고치기 전과 같다`() {
        val o = parse("경기 군포 부곡동", "›", "서울 중구 을지로6가", "당상", "수", "5Km", "05:12", "수", "당착",
            "1톤/전체", "지금상 당착 59박스 수/수-A", "독차", "인수증", "60,000원")
        /* 🔴 하차 «○○로N가» — 지역 분석기가 «숫자+가»를 못 알아보면 하차를 상차로 채운다 */
        assertEquals(listOf("경기 군포 부곡동", "서울 중구 을지로6가", "1톤/전체", "60000"), listOf(o.pickup, o.dropoff, o.vehicleType, o.fare.toString()))
    }

    @Test fun `실물 목록 - 답이 고치기 전과 같다`() {
        val o = parse("인천 미추홀", "경기 안성 일죽면", "당상", "지", "17Km", "06:33", "당착",
            "3.5톤/윙", "당일상 당착 공파렛", "독차", "인수증", "120,000원", "홈", "마이페이지")
        assertEquals(listOf("미추홀", "경기 안성 일죽면", "3.5톤/윙", "120000"), listOf(o.pickup, o.dropoff, o.vehicleType, o.fare.toString()))
    }

    @Test fun `하차 «○○N동» 도 하차로 읽는다 - 상차로 채우지 않는다`() {
        val o = parse("경기 광주 경안동", "›", "서울 강남구 역삼1동", "당상", "수", "5Km", "05:12", "수", "당착",
            "1톤/전체", "독차", "인수증", "60,000원")
        assertEquals("서울 강남구 역삼1동", o.dropoff)
    }

    /* 시뮬 원문(DB 원장 · 원달앱이 «, »로 이어 올린 글) */
    private fun sim(raw: String) = parser.parse(raw.split(", "))

    @Test fun `시뮬 - 차종 줄을 하차로 줍지 않는다`() {
        val o = sim("경기 광주 장지9길, ›, 서울 송파구 올림픽로, 당상, 수, 6, Km, 13:57, 수, 당착, 오토바이/전체서류봉투, 독차, 계산서, 39,000, 원")
        assertFalse(o.dropoff, o.dropoff.contains("서류봉투"))
    }

    @Test fun `시뮬 - 결제 글을 하차로 줍지 않는다`() {
        val o = sim("경기 광주 경충대로, ›, 서울 구로구 구로중앙로18길, 당상, 수, 5, Km, 11:33, 수, 당착, 1톤/전체마대 1개, 독차, 무과세, 61,000, 원")
        assertFalse(o.dropoff, o.dropoff.contains("무과세"))
    }

    @Test fun `시뮬 - 아래 막대 글을 상차로 줍지 않는다`() {
        val o = sim("🚚 배차내역, 경기 광주 곤지암읍, ›, 서울 마포구 상암동, 당상, 수, 5, Km, 12:20, 수, 당착, 다마스/전체마대 1개, 독차, 계산서, 61,000, 원")
        assertFalse(o.pickup, o.pickup.contains("배차내역"))
        assertFalse(o.dropoff, o.dropoff.contains("배차내역"))
    }
}
