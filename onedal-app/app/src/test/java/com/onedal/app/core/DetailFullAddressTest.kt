package com.onedal.app.core

import com.onedal.app.core.engine.OrderRequirement
import com.onedal.app.core.engine.TappedCall
import com.onedal.app.models.SimplifiedOfficeOrder
import com.onedal.app.plugins.insung.InsungPopupAddress
import com.onedal.app.plugins.kakaopicker.PickerDetailOcrParser
import com.onedal.app.plugins.kakaopicker.PickerStopFromImage
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * 🏠 **상세의 필수 요소는 전체 주소 — 세 배차망 같은 순서** (기사님 «상세에 들어간 뒤엔 모든 주소를 다 가지고 있어야 한다»)
 *
 * 읽기 → 그 배차망의 채우기 → 그래도 모자라면 사진(사진 판독기가 있는 배차망만) → 필수 요소 대조(모자라면 버림) → «누른 그 콜인가» → 채운 뒤 필터 → 보고.
 * 서버는 원달앱이 올린 상차·하차를 그대로 쓴다 — 짧은 주소가 서버에 가지 않는다.
 */
class DetailFullAddressTest {

    private fun codeOnly(path: String) = File(path).readText()
        .replace(Regex("/\\*[\\s\\S]*?\\*/"), "").replace(Regex("//.*"), "")

    private val seq = codeOnly("src/main/java/com/onedal/app/core/engine/PreConfirmSequence.kt")

    /**
     * 실제 명부(서버 지도)에 있는 곳 — `meetsDetail` 은 원달앱에 굳힌 명부를 쓰므로 실제 이름이 하나 필요하다(범용 이름을 쓰면 명부 밖이라 늘 탈락).
     * 명부 대조의 모양은 `AddressFormTest` 가 범용 이름으로 본다. 여기는 순서만.
     */
    private val full = "서울 강남구 역삼동"

    private fun order(pickup: String, dropoff: String, fare: Int = 20000) = SimplifiedOfficeOrder(
        id = "t", type = "NEW_ORDER", pickup = pickup, dropoff = dropoff, fare = fare, timestamp = "2026-09-29T10:00:00",
    )

    @Test
    fun `짧은 주소는 상세 필수 요소를 못 채운다 · 도보도 하차가 필수다`() {
        assertTrue(OrderRequirement.meetsDetail(order(full, full)))
        assertFalse("목록 줄임 이름", OrderRequirement.meetsDetail(order("강남 역삼", full)))
        assertFalse("하차 없는 도보", OrderRequirement.meetsDetail(order(full, "")))
        assertFalse("요금 없음", OrderRequirement.meetsDetail(order(full, full, fare = 0)))
    }

    @Test
    fun `인성 팝업 위치를 전체 주소로 꺼낸다 - 같은 줄 · 다음 줄 · 없음`() {
        val collected = "목록 글자\n[적요상세/정보]\n적요 내용 없음\n[출발지상세]\n고객 가나상사\n위치: 가나 다라구 마바동 1-2\n전화1 010\n" +
            "[도착지상세]\n위치\n자차시 카타구 파하로 12\n"
        assertEquals("가나 다라구 마바동 1-2", InsungPopupAddress.of(collected, InsungPopupAddress.PICKUP_TAG))
        assertEquals("자차시 카타구 파하로 12", InsungPopupAddress.of(collected, InsungPopupAddress.DROPOFF_TAG))
        assertNull(InsungPopupAddress.of("[출발지상세]\n고객 가나\n", InsungPopupAddress.PICKUP_TAG))
    }

    @Test
    fun `픽커 사진 주소는 행정동 주소 뒤에 건물명을 붙인다`() {
        val withPlace = PickerStopFromImage(admin = "가나 다라구 마바1동", place = "라마빌딩", straightKm = 1.0, at = null)
        assertEquals("가나 다라구 마바1동 라마빌딩", PickerDetailOcrParser.fullAddress(withPlace))
        assertEquals("가나 다라구 마바1동", PickerDetailOcrParser.fullAddress(withPlace.copy(place = null)))
    }

    @Test
    fun `누른 그 콜인가 - 목록 줄 동 토막이 상세 전체 주소에 있어야 한다`() {
        val tapped = order("다라 마바1", "카타 파하")
        assertNull(TappedCall.mismatch(tapped, order("가나 다라구 마바1동 라마빌딩", "자차시 카타구 파하동")))
        assertNotNull(TappedCall.mismatch(tapped, order("가나 다라구 사아동", "자차시 카타구 파하동")))
        assertNull("도보(목록 하차 없음)는 하차를 대조하지 않는다", TappedCall.mismatch(order("다라 마바1", ""), order("가나 다라구 마바1동", "자차시 카타구 파하동")))
    }

    @Test
    fun `사진은 필수 요소가 모자랄 때만 · 무조건 사진 갈래가 없다`() {
        assertFalse("배차망에 사진 판독기가 있다는 것만으로 사진을 찍는다",
            Regex("""if\s*\(\s*plugin\.ocrParser\s*!=\s*null\s*\)""").containsMatchIn(seq))
        assertTrue(Regex("""!OrderRequirement\.meetsDetail\(order\)\s*&&\s*plugin\.ocrParser\s*!=\s*null""").containsMatchIn(seq))
    }

    @Test
    fun `글자로 채운 콜과 사진으로 채운 콜이 같은 대조 · 같은 검증을 지난다`() {
        assertTrue("필수 요소 대조가 두 곳에 없다", Regex("""OrderRequirement\.(meetsDetail|missingDetail)\(""").findAll(seq).count() >= 3)   // missingDetail = 모자란 요건 이름 (meetsDetail 은 그 목록이 비었는가)
        assertTrue("«누른 그 콜인가» 검증이 두 곳에서 불리지 않는다", Regex("""dropIfNotTappedCall\(""").findAll(seq).count() >= 3)
        assertFalse("상세에서 옛 요건(meets)을 본다", seq.contains("OrderRequirement.meets("))
    }
}
