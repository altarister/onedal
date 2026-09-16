package com.onedal.app.plugins.kakaopicker

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * 📅 **예약 날짜 배지(«9/23(수)»)는 지역 이름이 아니다** (기사님 지시).
 *
 * 카드에 예약 **시각**(«17:30»)이 있으면 알아보는데 예약 **날짜**(«9/23(수)»)는 알아보지 못해
 * 지역 이름으로 들어갔다. 지역 칸이 한 칸씩 밀려 출발·도착이 통째로 틀어진다.
 *
 * ── 실물 글자 (실물 카카오T픽커 · 서버 장부 `intel.rawText` 에서 그대로 옮김) ──
 *   중형 수정 예약 9/23(수) 10,857 퀵 광주 능평 수진2 12.0km
 *   → 저장된 값 «9/23(수) 광주 → 수정 수진2» · 진짜 콜은 «광주 능평 → 수정 수진2»
 *
 * 🔴 날짜는 **버리지 않고 꼬리표로 챙긴다** — 예약이 언제인지가 콜을 고르는 정보다.
 */
class PickerDateBadgeTest {

    private val parser = KakaoPickerParser(null)

    @Test
    fun `예약 날짜는 지역이 아니라 꼬리표다`() {
        val o = parser.parse(listOf("중형", "수정", "예약", "9/23(수)", "10,857", "퀵", "광주", "능평", "수진2", "12.0km"))
        assertEquals(10857, o.fare)
        assertEquals("광주 능평", o.pickup)
        assertEquals("수정 수진2", o.dropoff)
        assertTrue("날짜가 꼬리표에 없다: ${o.tagsText}", o.tagsText?.contains("9/23(수)") == true)
    }

    @Test
    fun `날짜가 붙어도 도착지를 잃지 않는다`() {
        val o = parser.parse(listOf("중형", "구로", "반나절", "예약", "9/23(수)", "퀵", "14,861", "수정", "위례", "구로1", "16.8km"))
        assertEquals("수정 위례", o.pickup)
        assertEquals("구로 구로1", o.dropoff)
    }

    /** 실물 원문: «소형 송파 퀵 반나절 예약 19:50 4,620 송파 문정2 장지 18.9km» */
    @Test
    fun `예약 시각은 지금도 꼬리표다 - 날짜를 더해도 안 깨진다`() {
        val o = parser.parse(listOf("소형", "송파", "퀵", "반나절", "예약", "19:50", "4,620", "송파", "문정2", "장지", "18.9km"))
        assertEquals("송파 문정2", o.pickup)
        assertEquals("송파 장지", o.dropoff)
        assertTrue("시각이 꼬리표에 없다: ${o.tagsText}", o.tagsText?.contains("19:50") == true)
    }

    /**
     * 실물 원문: «준비 완료 소형 기흥 퀵 단거리 2,375 기흥 동백2 동백1 16.7km»
     * 🔴 «준비 완료» 는 실물에서 **한 덩어리로** 온다 (장부 200건 중 44건이 붙은 채 · 쪼개져 온 판은 0건).
     */
    @Test
    fun `배지 없는 카드는 그대로 읽힌다`() {
        val o = parser.parse(listOf("준비 완료", "소형", "기흥", "퀵", "단거리", "2,375", "기흥", "동백2", "동백1", "16.7km"))
        assertEquals("기흥 동백2", o.pickup)
        assertEquals("기흥 동백1", o.dropoff)
    }
}
