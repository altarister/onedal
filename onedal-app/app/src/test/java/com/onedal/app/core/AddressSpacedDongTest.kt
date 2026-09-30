package com.onedal.app.core

import com.onedal.app.core.engine.AddressForm
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * 🏘️ **동 이름과 번호 사이가 띄어 읽힌 주소도 전체 주소다** (onedal-ab · 1f «가»).
 * 라이브 10-01 00:32:02 픽커 상세 하차 «경기 용인시 수지구 죽전 1동 순창떡» — 사진 판독이 띄웠다(09-30 21:35 같은 콜은 «죽전1동»으로 붙어 읽혔다).
 * 요건 검사가 «죽전»·«1동»을 따로 봐 동을 못 찾고 «하차 주소 짧음»으로 판정을 못 받았다.
 */
class AddressSpacedDongTest {
    @Test fun `죽전 1동은 전체 주소`() = assertTrue(AddressForm.isFull("경기 용인시 수지구 죽전 1동 순창떡"))

    @Test fun `한글 공백 숫자 동가 는 붙인다`() {
        assertEquals("경기 용인시 수지구 죽전1동 순창떡", AddressForm.joinSpacedUnit("경기 용인시 수지구 죽전 1동 순창떡"))
        assertEquals("서울 중구 을지로3가", AddressForm.joinSpacedUnit("서울 중구 을지로 3가"))
        assertEquals("배송 4.5km", AddressForm.joinSpacedUnit("배송 4.5km"))
        assertEquals("101동 1203호", AddressForm.joinSpacedUnit("101동 1203호"))
    }

    /**
     * 🏢 **아파트 동 번호는 붙이지 않는다** (교차 리뷰 · onedal-ab · onedal-1f «가»).
     * 붙이는 것은 앞 토막이 명부의 읍면동(«죽전»+동 · «을지로»)이고 숫자가 1~2자리일 때뿐 —
     * «푸르지오 2동»을 붙이면 행정동 없는 주소가 «전체 주소»로 통과했다.
     */
    @Test fun `아파트 동 번호는 안 붙인다 · 행정동 없는 주소는 전체가 아니다`() {
        assertEquals("경기 용인시 수지구 푸르지오 2동", AddressForm.joinSpacedUnit("경기 용인시 수지구 푸르지오 2동"))
        assertFalse(AddressForm.isFull("경기 용인시 수지구 푸르지오 2동"))
        assertEquals("수지구 푸르지오 101동", AddressForm.joinSpacedUnit("수지구 푸르지오 101동"))
        assertEquals("죽전 101동", AddressForm.joinSpacedUnit("죽전 101동"))
    }
}
