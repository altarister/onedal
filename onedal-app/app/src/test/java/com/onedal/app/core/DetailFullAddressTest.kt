package com.onedal.app.core

import com.onedal.app.core.engine.OrderRequirement
import com.onedal.app.core.engine.TappedCall
import com.onedal.app.models.SimplifiedOfficeOrder
import com.onedal.app.plugins.insung.InsungPopupAddress
import com.onedal.app.plugins.kakaopicker.PickerDetailOcrParser
import com.onedal.app.plugins.kakaopicker.PickerDetailFromImage
import com.onedal.app.plugins.kakaopicker.PickerStopFromImage
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File
import com.onedal.app.models.CallStop

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
        id = "t",
        type = "NEW_ORDER",
        fare = fare, money = com.onedal.app.models.CallMoney.ofIncome(fare),
        timestamp = "2026-09-29T10:00:00",
        pickupDetails = listOf(CallStop(listText = pickup)),
        dropoffDetails = listOf(CallStop(listText = dropoff)),
    )

    @Test
    fun `짧은 주소는 상세 필수 요소를 못 채운다 · 도보도 하차가 필수다`() {
        assertTrue(OrderRequirement.meetsDetail(TargetApp.KAKAOPICKER, order(full, full)))
        assertFalse("목록 줄임 이름", OrderRequirement.meetsDetail(TargetApp.KAKAOPICKER, order("강남 역삼", full)))
        assertFalse("하차 없는 도보", OrderRequirement.meetsDetail(TargetApp.KAKAOPICKER, order(full, "")))
        assertFalse("요금 없음", OrderRequirement.meetsDetail(TargetApp.KAKAOPICKER, order(full, full, fare = 0)))
    }

    @Test
    fun `인성 팝업 위치를 전체 주소로 꺼낸다 - 같은 줄 · 다음 줄 · 없음`() {
        val collected = "목록 글자\n[적요상세/정보]\n적요 내용 없음\n[출발지상세]\n고객 가나상사\n위치: 가나 다라구 마바동 1-2\n전화1 010\n" +
            "[도착지상세]\n위치\n자차시 카타구 파하로 12\n"
        assertEquals("가나 다라구 마바동 1-2", InsungPopupAddress.of(collected, InsungPopupAddress.PICKUP_TAG))
        assertEquals("자차시 카타구 파하로 12", InsungPopupAddress.of(collected, InsungPopupAddress.DROPOFF_TAG))
        assertNull(InsungPopupAddress.of("[출발지상세]\n고객 가나\n", InsungPopupAddress.PICKUP_TAG))
    }

    /** 🔴 상세 글자로 목록 글자를 덮지 않는다 — 팝업 «위치»는 정거장 상세 주소, 목록 칸 원문은 그대로 */
    @Test
    fun `인성 팝업 위치는 정거장 상세 주소로 · 목록 칸 원문이 남는다`() {
        val collected = "[출발지상세]\n위치: 경기 광주시 초월읍 경충대로 907\n[도착지상세]\n위치\n경기 광주시 곤지암읍 곤지암로 1\n"
        val filled = InsungPopupAddress.fill(order("급송/초월읍", "곤지암읍"), collected)
        assertEquals("급송/초월읍", firstPickupStop(filled)?.listText)
        assertEquals("경기 광주시 초월읍 경충대로 907", firstPickupStop(filled)?.addressDetail)
        assertEquals("곤지암읍", lastDropoffStop(filled)?.listText)
        assertEquals("경기 광주시 곤지암읍 곤지암로 1", lastDropoffStop(filled)?.addressDetail)
        val unread = InsungPopupAddress.fill(order("초월읍", "곤지암읍"), "[출발지상세]\n고객 가나\n")
        assertNull("못 꺼낸 쪽은 상세 주소가 빈다", firstPickupStop(unread)?.addressDetail)
        assertEquals("초월읍", firstPickupStop(unread)?.listText)
    }

    /** 🔴 픽커 사진 주소 — 행정동은 정거장 상세 주소 · 회색 상호는 상호 칸 · 판정 글자는 이어 붙이던 글자와 같다 */
    @Test
    fun `픽커 사진 행정동은 상세 주소 · 회색 상호는 상호 칸 · 목록 원문이 남는다`() {
        val photo = PickerDetailFromImage(
            pickup = PickerStopFromImage(admin = "경기 성남시 중원구 은행2동", place = "퓨전중화요리-궁", straightKm = 1.0, at = null),
            dropoff = PickerStopFromImage(admin = "서울 강남구 역삼동", place = null, straightKm = 5.0, at = null),
            itemSize = null, reserved = false,
        )
        val card = order("중원 은행2", "강남 역삼")
        val tapped = (PickerDetailOcrParser().verify(photo, card, null, emptyList(), "") as PickerDetailOcrParser.VerifyResult.Success).order
        val p = firstPickupStop(tapped)
        val d = lastDropoffStop(tapped)
        assertEquals("중원 은행2", p?.listText)
        assertEquals("경기 성남시 중원구 은행2동", p?.addressDetail)
        assertEquals("퓨전중화요리-궁", p?.customerName)
        assertEquals("강남 역삼", d?.listText)
        assertEquals("서울 강남구 역삼동", d?.addressDetail)
        assertNull(d?.customerName)
        assertEquals("판정 글자 — 이어 붙이던 글자와 같다", StopText.query(TargetApp.KAKAOPICKER, CallStop(listText = "경기 성남시 중원구 은행2동 퓨전중화요리-궁")), StopText.query(TargetApp.KAKAOPICKER, p))
        assertNull("누른 그 콜 — 상세 쪽은 상세 주소", TappedCall.mismatch(TargetApp.KAKAOPICKER, card, tapped))
        val hand = (PickerDetailOcrParser().verify(photo, null, null, emptyList(), "") as PickerDetailOcrParser.VerifyResult.Success).order
        assertNull("목록 줄을 못 찾은 손 상세는 목록 원문이 없다", firstPickupStop(hand)?.listText)
        assertEquals("경기 성남시 중원구 은행2동", firstPickupStop(hand)?.addressDetail)
        assertEquals("퓨전중화요리-궁", firstPickupStop(hand)?.customerName)
    }

    @Test
    fun `누른 그 콜인가 - 목록 줄 동 토막이 상세 전체 주소에 있어야 한다`() {
        val tapped = order("다라 마바1", "카타 파하")
        assertNull(TappedCall.mismatch(TargetApp.KAKAOPICKER, tapped, order("가나 다라구 마바1동 라마빌딩", "자차시 카타구 파하동")))
        assertNotNull(TappedCall.mismatch(TargetApp.KAKAOPICKER, tapped, order("가나 다라구 사아동", "자차시 카타구 파하동")))
        assertNull("도보(목록 하차 없음)는 하차를 대조하지 않는다", TappedCall.mismatch(TargetApp.KAKAOPICKER, order("다라 마바1", ""), order("가나 다라구 마바1동", "자차시 카타구 파하동")))
    }

    /** 🔴 인성 목록 줄은 칸 원문(«급송/초월읍» · «오전1시41/곤지암읍»)으로 온다 — 목록 쪽은 판정 글자로 대조해야 팝업 «위치»와 같은 콜이다 */
    @Test
    fun `누른 그 콜인가 - 인성 칸 원문은 판정 글자로 대조한다`() {
        val popup = order("경기 광주시 초월읍 경충대로 907 모다아울렛", "경기 광주시 곤지암읍 곤지암로 1")
        val express = order("급송/초월읍", "곤지암읍")
        assertNull(TappedCall.mismatch(TargetApp.INSUNG, express, popup))
        val reserved = express.copy(pickupDetails = listOf(CallStop(listText = "초월읍")),
            dropoffDetails = listOf(CallStop(listText = "오전1시41/곤지암읍", promiseText = "오전1시41")))
        assertNull(TappedCall.mismatch(TargetApp.INSUNG, reserved, popup))
        assertNotNull("다른 장소 팝업은 불일치", TappedCall.mismatch(TargetApp.INSUNG, express, order("경기 광주시 오포읍 문형리 1", "경기 광주시 곤지암읍 곤지암로 1")))
    }

    @Test
    fun `사진은 필수 요소가 모자랄 때만 · 무조건 사진 갈래가 없다`() {
        assertFalse("배차망에 사진 판독기가 있다는 것만으로 사진을 찍는다",
            Regex("""if\s*\(\s*plugin\.ocrParser\s*!=\s*null\s*\)""").containsMatchIn(seq))
        assertTrue(Regex("""!OrderRequirement\.meetsDetail\(currentTargetApp, order\)\s*&&\s*plugin\.ocrParser\s*!=\s*null""").containsMatchIn(seq))
    }

    @Test
    fun `글자로 채운 콜과 사진으로 채운 콜이 같은 대조 · 같은 검증을 지난다`() {
        assertTrue("필수 요소 대조가 두 곳에 없다", Regex("""OrderRequirement\.(meetsDetail|missingDetail)\(""").findAll(seq).count() >= 3)   // missingDetail = 모자란 요건 이름 (meetsDetail 은 그 목록이 비었는가)
        assertTrue("«누른 그 콜인가» 검증이 두 곳에서 불리지 않는다", Regex("""dropIfNotTappedCall\(""").findAll(seq).count() >= 3)
        assertFalse("상세에서 옛 요건(meets)을 본다", seq.contains("OrderRequirement.meets("))
    }
}
