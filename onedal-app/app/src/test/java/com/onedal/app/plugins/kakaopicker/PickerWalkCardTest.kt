package com.onedal.app.plugins.kakaopicker

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * 🚶 **도보 콜의 «31분 내» 는 지역 이름이 아니다** (`pnpm db parse` 가 찾아냈다).
 *
 * 도보 콜은 «N분 내»로 남은 시간을 적는다. 「31분」은 거르는데 **「내」는 안 걸러서**
 * 지역 이름으로 들어갔다 — 서버 장부 537건 중 **144건**이 주소 칸에 「N분 내」를 달고 저장됐다.
 *
 * ── 실물 글자 (실물 카카오T픽커 · 서버 장부 `intel.rawText`) ──
 *   31분 내 준비 14분 1.5km 도보 2,241 GS슈퍼[용인둔전] 임원마을영화아파트 14.0km
 *   → 저장된 값 «31분 내 GS슈퍼[용인둔전] 임원마을영화아파트 → (빈칸)»
 *
 * 🔴 도보 콜은 지역 이름 대신 **가게 이름 → 건물 이름**이다. 그 둘은 온전히 담겨야 한다.
 * 🔴 남은 시간은 **버리지 않고 꼬리표로** 챙긴다 — 언제까지 가야 하는지가 콜을 고르는 정보다.
 */
class PickerWalkCardTest {

    private val parser = KakaoPickerParser(null)

    /**
     * 🔴 **«31분 내» 는 실물에서 한 덩어리로 온다** — 실물 원문:
     *   «31분 내 준비 18분 487m 도보 3,200 교촌치킨-야탑역점 금호프라자 15.0km»
     * 처음엔 «31분» 과 «내» 가 따로 오는 줄 알고 규칙을 만들어 안 들었다 (「준비 완료」와 같은 실수).
     */
    @Test
    fun `남은 시간은 지역이 아니라 꼬리표다 - 붙어서 온다`() {
        val o = parser.parse(
            listOf("31분 내", "준비 18분", "487m", "도보", "3,200", "교촌치킨-야탑역점", "금호프라자", "15.0km"),
        )
        assertEquals(3200, o.fare)
        assertTrue("가게 이름이 출발지에 없다: ${o.pickup}", o.pickup.contains("교촌치킨-야탑역점"))
        assertTrue("남은 시간이 주소에 샜다: ${o.pickup}→${o.dropoff}", !"${o.pickup} ${o.dropoff}".contains("31분"))
        assertTrue("남은 시간이 꼬리표에 없다: ${o.tagsText}", o.tagsText?.contains("31분 내") == true)
    }

    /** 따로 떨어져 오는 판도 있을 수 있다 — 그때도 주소로 새면 안 된다 */
    @Test
    fun `남은 시간이 쪼개져 와도 지역이 아니다`() {
        val o = parser.parse(
            listOf("31분", "내", "준비 14분", "1.5km", "도보", "2,241", "GS슈퍼[용인둔전]", "임원마을영화아파트", "14.0km"),
        )
        assertEquals(2241, o.fare)
        assertTrue("가게 이름이 출발지에 없다: ${o.pickup}", o.pickup.contains("GS슈퍼[용인둔전]"))
        assertTrue("남은 시간이 꼬리표에 없다: ${o.tagsText}", o.tagsText?.contains("31분") == true)
    }

    @Test
    fun `도보 콜은 가게 이름과 건물 이름을 둘 다 담는다`() {
        val o = parser.parse(
            listOf("51분", "내", "준비 완료", "1.2km", "도보", "2,104", "올영 판교아브뉴프랑점", "판교로 242", "16.1km"),
        )
        assertTrue("가게 이름을 잃었다: ${o.pickup}", o.pickup.contains("올영 판교아브뉴프랑점"))
        assertTrue("건물 이름을 잃었다: ${o.pickup}→${o.dropoff}", "${o.pickup} ${o.dropoff}".contains("판교로 242"))
    }
}
