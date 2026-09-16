package com.onedal.app.plugins.kakaopicker

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * 🔀 **경유 콜 — 목적지가 여럿이다** (실물 카카오T픽커 라이브 · 6만 원짜리도 있었다).
 *
 * 한 콜에 들를 곳이 여럿이면 시 이름과 동 이름이 **쉼표로 이어진 한 덩어리**로 온다.
 * 지금은 그것을 지역 토막으로 세다가 주소가 통째로 엉켰다 —
 * 저장된 값이 «경유 9/18(금) → 수지, 영통, … 상현3, 원천, …» 이 됐다.
 *
 * ── 실물 원문 (서버 장부 `intel.rawText` 에서 그대로) ──
 *   수지, 영통, 상록, 상록, 연수, 연수, 미추홀  퀵 경유 승 예약 9/18(금)  62,986
 *   기흥 신갈  상현3, 원천, 해양, 해양, 송도1, 송도4, 용현5  19.3km
 *   → 출발지 «기흥 신갈» · 도착지는 일곱 곳
 *
 * 🔴 **첫 도착지만 콜 주소로 쓴다** — 서버 경로는 상차 한 곳 · 하차 한 곳으로 센다.
 *    나머지 들를 곳은 꼬리표에 남겨 **잃지 않는다** (기사님: 버리지 말 것).
 */
class PickerViaCallTest {

    private val parser = KakaoPickerParser(null)

    @Test
    fun `경유 콜도 출발지를 잃지 않는다`() {
        val o = parser.parse(
            listOf(
                "수지, 영통, 상록, 상록, 연수, 연수, 미추홀", "퀵", "경유", "승", "예약", "9/18(금)",
                "62,986", "기흥 신갈", "상현3, 원천, 해양, 해양, 송도1, 송도4, 용현5", "19.3km",
            ),
        )
        assertEquals(62986, o.fare)
        assertEquals("기흥 신갈", o.pickup)
        assertTrue("경유가 주소에 샜다: ${o.pickup}→${o.dropoff}", !"${o.pickup} ${o.dropoff}".contains("경유"))
        assertTrue("날짜가 주소에 샜다: ${o.pickup}→${o.dropoff}", !"${o.pickup} ${o.dropoff}".contains("9/18"))
    }

    @Test
    fun `들를 곳이 여럿이면 첫 곳을 도착지로 쓰고 나머지는 꼬리표에 남긴다`() {
        val o = parser.parse(
            listOf(
                "수지, 영통, 상록, 상록, 연수, 연수, 미추홀", "퀵", "경유", "승", "예약", "9/18(금)",
                "62,986", "기흥 신갈", "상현3, 원천, 해양, 해양, 송도1, 송도4, 용현5", "19.3km",
            ),
        )
        assertEquals("수지 상현3", o.dropoff)
        assertTrue("들를 곳 수가 꼬리표에 없다: ${o.tagsText}", o.tagsText?.contains("경유") == true)
    }
}
