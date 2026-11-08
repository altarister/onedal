package com.onedal.app.plugins.kakaopicker

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import com.onedal.app.core.firstPickupStop
import com.onedal.app.core.lastDropoffStop
import com.onedal.app.core.StopText

/**
 * 🔀 **경유 콜 — 목적지가 여럿이다** (실물 카카오T픽커 라이브 · 6만 원짜리도 있었다).
 *
 * 한 콜에 들를 곳이 여럿이면 시 이름과 동 이름이 **쉼표로 이어진 한 덩어리**로 온다.
 * 그 덩어리를 지역 토막으로 세면 주소가 통째로 엉킨다 —
 * 저장된 값이 «경유 9/18(금) → 수지, 영통, … 상현3, 원천, …» 이 된다.
 *
 * ── 실물 원문 (서버 장부 `intel.rawText` 에서 그대로) ──
 *   수지, 영통, 상록, 상록, 연수, 연수, 미추홀  퀵 경유 승 예약 9/18(금)  62,986
 *   기흥 신갈  상현3, 원천, 해양, 해양, 송도1, 송도4, 용현5  19.3km
 *   → 출발지 «기흥 신갈» · 도착지는 일곱 곳
 *
 * 🔴 **첫 도착지만 콜 주소로 쓴다** — 서버 경로는 상차 한 곳 · 하차 한 곳으로 센다.
 *    나머지 들를 곳은 **몇 곳인지**를 꼬리표(«경유 N곳»)에 남긴다 (기사님: 버리지 말 것).
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
        assertEquals("기흥 신갈", StopText.of(firstPickupStop(o)))
        assertTrue("경유가 주소에 샜다: ${StopText.of(firstPickupStop(o))}→${StopText.of(lastDropoffStop(o))}", !"${StopText.of(firstPickupStop(o))} ${StopText.of(lastDropoffStop(o))}".contains("경유"))
        assertTrue("날짜가 주소에 샜다: ${StopText.of(firstPickupStop(o))}→${StopText.of(lastDropoffStop(o))}", !"${StopText.of(firstPickupStop(o))} ${StopText.of(lastDropoffStop(o))}".contains("9/18"))
    }

    @Test
    fun `들를 곳이 여럿이면 첫 곳을 도착지로 쓰고 나머지는 꼬리표에 남긴다`() {
        val o = parser.parse(
            listOf(
                "수지, 영통, 상록, 상록, 연수, 연수, 미추홀", "퀵", "경유", "승", "예약", "9/18(금)",
                "62,986", "기흥 신갈", "상현3, 원천, 해양, 해양, 송도1, 송도4, 용현5", "19.3km",
            ),
        )
        assertEquals("수지 상현3", StopText.of(lastDropoffStop(o)))
        assertTrue("들를 곳 수가 꼬리표에 없다: ${o.tagsText}", o.tagsText?.contains("경유") == true)
    }

    /** 🔴 «기흥  신갈»처럼 빈칸이 겹쳐 와도 정거장 글자는 빈칸 하나 · 끝 빈칸 없음 */
    @Test
    fun `토막을 이을 때 빈칸이 겹치거나 끝에 남지 않는다`() {
        val o = parser.parse(
            listOf(
                "수지, 영통, 상록", "퀵", "경유", "승", "62,986", "기흥  신갈", "상현3, 원천, 해양", "19.3km",
            ),
        )
        assertEquals("기흥 신갈", firstPickupStop(o)?.listText)
        assertEquals("수지 상현3", lastDropoffStop(o)?.listText)
    }
}
