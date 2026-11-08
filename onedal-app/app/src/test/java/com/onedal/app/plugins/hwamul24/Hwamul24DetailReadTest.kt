package com.onedal.app.plugins.hwamul24

import android.content.ContextWrapper
import com.onedal.app.core.Page
import com.onedal.app.core.PageFieldRead
import com.onedal.app.core.engine.OrderRequirement
import com.onedal.app.models.SimplifiedOfficeOrder
import com.onedal.app.plugins.insung.InsungPages
import com.onedal.app.plugins.insung.InsungParser
import com.onedal.app.plugins.kakaopicker.KakaoPickerPages
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import com.onedal.app.models.CallStop
import com.onedal.app.core.firstPickupStop
import com.onedal.app.core.lastDropoffStop
import com.onedal.app.core.StopText

/**
 * 📄 **화물24시 상세를 상세로 읽는다** (29 X12 · 69판 장면 6) — 손 · 알람으로 연 상세에서 판정이 서야 한다.
 * 견본은 실물 캡처 18(`ex_images/화물24시/18_화물상세정보_배차신청.png`)의 글 노드 차례 — 머리(제목 · ID · 잔액 · 화물번호 · 등록시간)와 바닥(산재보험료)이 붙어 있다.
 * 상세 처리 순서는 세 배차망 같다: 배차망이 상세 글 다듬기(`detailTextsOf`) → 목록 줄 대조(`matchDetailOrder`) → 못 찾으면 화면 읽기 + 요금은 상세 칸 정의 먼저(`PageFieldRead.fareFirst`).
 * 못 잡는 것: 실물 노드 차례가 캡처와 다른 경우(사업자 뒤 실물) · 사진 판독 길.
 */
class Hwamul24DetailReadTest {
    private val parser = Hwamul24Parser(ContextWrapper(null))
    private val real18 = listOf(
        "화물상세정보", "ID :", "37788", "잔액 :", "50,000원",
        "화물과퀵", "60분 안보기", "화물번호:3-9483-2159", "[ 등록시간:05:18분 ]",
        "상차지", "경기 군포 부곡동", "당상", "수", "5Km",
        "하차지", "서울 중구 을지로6가", "당착", "수", "36Km",
        "화물정보", "지금상 당착 59박스 수/수-A", "독차",
        "톤수", "1톤", "차종", "전체", "적재중량", "1톤", "운행방법", "편도",
        "[ 카드수납 수수료 = (운송료+부가세) x1.298% ]",
        "운송료", "60,000", "부가세", "6,000", "결제방법", "카드", "수납금액", "65,144",
        "[산재보험료(차주부담액):", "260원]",
        "배차신청", "돌아가기",
    )

    /** 상세 처리 순서 그대로 — 손으로 연 상세(목록 줄 못 찾음)의 화면 읽기 갈래 */
    private fun readHandDetail(texts: List<String>): SimplifiedOfficeOrder {
        val detail = Hwamul24Plugin(null).detailTextsOf(texts)
        return PageFieldRead.fareFirst(parser.parseWith(detail, Hwamul24Parser.NOISE_WORDS), Hwamul24Pages.pages, Page.NEW_CALL, detail)
    }

    @Test fun `🔴 손으로 연 실물 상세 — 상차 · 하차 · 요금(운송료)이 선다`() {
        val o = readHandDetail(real18)
        assertTrue(StopText.of(firstPickupStop(o)), StopText.of(firstPickupStop(o)).contains("군포"))
        assertTrue(StopText.of(lastDropoffStop(o)), StopText.of(lastDropoffStop(o)).contains("중구"))
        assertEquals("잔액 · 산재보험료가 아니라 운송료", 60_000, o.fare)
    }

    /** 목록 요금 규칙은 «…원» 한 줄 전체만 요금으로 본다 — «260원]»은 안 집지만, 노드가 «260원» · «]» 로 갈려 오면 집는다(실물 노드 차례는 사업자 뒤 확인) */
    @Test fun `🔴 산재보험료 값이 «260원» 노드로 갈려 와도 요금은 운송료 — 상세 요금 칸이 먼저`() {
        val split = real18.flatMap { if (it == "260원]") listOf("260원", "]") else listOf(it) }
        assertEquals(60_000, readHandDetail(split).fare)
    }

    /** 실물 꼴(«경기 군포» — 시를 뺌 · 39 X12) 그대로 요건을 넘어 서버로 간다 */
    @Test fun `🔴 실물 꼴 상세는 요건을 넘는다 — 요금 없음 · 주소 짧음이 없다`() {
        val o = readHandDetail(real18)
        assertEquals(o.toString(), emptyList<String>(), OrderRequirement.missingDetail(com.onedal.app.core.TargetApp.HWAMUL24, o))
    }

    @Test fun `🔴 목록 줄 대조는 운송료로 — 잔액(50,000)에 속지 않는다`() {
        val listRow = SimplifiedOfficeOrder(id = "row", fare = 60_000, money = com.onedal.app.models.CallMoney.ofIncome(60_000), timestamp = "t", pickupDetails = listOf(CallStop(listText = "경기 군포 부곡동")), dropoffDetails = listOf(CallStop(listText = "서울 중구 을지로6가")))
        val other = listRow.copy(id = "other", fare = 50_000, money = com.onedal.app.models.CallMoney.ofIncome(50_000))
        assertEquals("row", parser.matchDetailOrder(real18, listOf(listRow, other))?.id)
    }

    /** 앱이 연 콜 — 목록 줄 값 위에 상세 글(공통이 상세 이은 글로 바꿔 둔 `rawText`)을 채운다 */
    private fun appOpened(pickup: String, dropoff: String, detail: List<String>) = SimplifiedOfficeOrder(
        id = "row", fare = 60_000, money = com.onedal.app.models.CallMoney.ofIncome(60_000), timestamp = "t", rawText = Hwamul24Plugin(null).detailTextsOf(detail).joinToString(" "),
        pickupDetails = listOf(CallStop(listText = pickup)), dropoffDetails = listOf(CallStop(listText = dropoff)),
    )

    /** 🔴 목록 하차가 잘린 콜(«경기 안산 단원구 오») — 상세 하차지 칸 주소를 정거장 상세 주소로 읽어 요건을 넘는다 · 목록 원문은 그대로 */
    @Test fun `🔴 목록 하차가 잘려도 상세 하차지 칸 주소로 요건을 넘는다`() {
        val detail = real18.map { if (it == "서울 중구 을지로6가") "경기 안산 단원구 와동왕복" else it }
        val row = appOpened("경기 군포 부곡동", "경기 안산 단원구 오", detail)
        val filled = Hwamul24Parser.fillFromDetail(row)
        assertEquals(filled.toString(), emptyList<String>(), OrderRequirement.missingDetail(com.onedal.app.core.TargetApp.HWAMUL24, filled))
        assertEquals("경기 안산 단원구 오", lastDropoffStop(filled)?.listText)
        assertEquals("경기 안산 단원구 와동왕복", lastDropoffStop(filled)?.addressDetail)
        assertEquals("경기 군포 부곡동", firstPickupStop(filled)?.addressDetail)
        assertNull("누른 그 콜", com.onedal.app.core.engine.TappedCall.mismatch(com.onedal.app.core.TargetApp.HWAMUL24, row, filled))
    }

    /** 🔴 화물24시 목록에는 배송 거리가 없다 — 상세 하차지 칸 «36Km»(실물 캡처 18)가 하차 정거장 거리 · 목록 상차 거리가 있으면 그대로 */
    @Test fun `🔴 상세 하차지 칸 «36Km» 가 하차 정거장 거리 — 목록 값이 먼저`() {
        val filled = Hwamul24Parser.fillFromDetail(appOpened("경기 군포 부곡동", "서울 중구 을지로6가", real18))
        assertEquals(36.0, lastDropoffStop(filled)?.distanceKm)
        assertEquals(36.0, com.onedal.app.core.deliveryKmOf(filled))
        val listed = appOpened("경기 군포 부곡동", "서울 중구 을지로6가", real18).let { o -> com.onedal.app.core.withFirstPickup(o) { it.copy(distanceKm = 4.0) } }
        assertEquals("목록 상차 거리 그대로", 4.0, firstPickupStop(Hwamul24Parser.fillFromDetail(listed))?.distanceKm)
    }

    /** 상세 상차지 칸 주소 끝 괄호(실물 캡처 53 «(크레텍)»)는 상호 칸 — 주소에는 안 남는다 · 못 읽은 칸은 목록 값 그대로 */
    @Test fun `상세 상차지 칸 끝 괄호는 상호 칸 · 칸이 없으면 목록 값 그대로`() {
        val detail = real18.map { if (it == "경기 군포 부곡동") "경기 군포 당정동 공단로124번길 4 (크레텍)" else it }
        val filled = Hwamul24Parser.fillFromDetail(appOpened("경기 군포 당정동", "서울 중구 을지로6가", detail))
        assertEquals("경기 군포 당정동 공단로124번길 4", firstPickupStop(filled)?.addressDetail)
        assertEquals("크레텍", firstPickupStop(filled)?.customerName)
        assertEquals("경기 군포 당정동", firstPickupStop(filled)?.listText)
        assertNull(lastDropoffStop(filled)?.customerName)
        val unread = appOpened("경기 군포 부곡동", "서울 중구 을지로6가", listOf("화물정보", "60,000원"))
        assertEquals(unread, Hwamul24Parser.fillFromDetail(unread))
    }

    @Test fun `상세 글은 «상차지»부터 — 머리가 없는 글은 그대로`() {
        assertEquals("상차지", Hwamul24Plugin(null).detailTextsOf(real18).first())
        val noHead = listOf("경기 군포 부곡동", "60,000원")
        assertEquals(noHead, Hwamul24Plugin(null).detailTextsOf(noHead))
    }

    /** 인성 상세는 목록 파서가 요금을 0 으로 읽고 «비면 칸으로»(withFare)가 채운다 — 칸 먼저로 바꿔도 마지막 값이 같다 */
    @Test fun `🔴 인성 — 요금 칸 먼저여도 지금 마지막 값과 같다(운행 무변화)`() {
        val samples = listOf(
            listOf("전표", "상태 : 신규", "물품 : 샘플 박스", "차량 : 5t", "탁송료 :", "수수료 : 23%", "요금 : 150,000(카드)", "구분 : 편도"),
            listOf("(주)신한로직스-1588-5480", "전표", "상태 : 배송", "물품 : 서류", "차량 : 트럭-1t", "탁송료 : 3,000", "수수료 : 20%", "요금 : 85,000(신용)", "구분 : 왕복"),
        )
        for (t in samples) {
            val read = SimplifiedOfficeOrder(id = "i", fare = InsungParser.readVehicleAndFare(t).second, money = com.onedal.app.models.CallMoney.ofIncome(InsungParser.readVehicleAndFare(t).second), timestamp = "t", pickupDetails = listOf(CallStop(listText = "")), dropoffDetails = listOf(CallStop(listText = "")))
            val now = PageFieldRead.withFare(read, InsungPages.pages, Page.NEW_CALL, t).fare
            assertTrue(t.toString(), now > 0)
            assertEquals(t.toString(), now, PageFieldRead.fareFirst(read, InsungPages.pages, Page.NEW_CALL, t).fare)
        }
    }

    @Test fun `픽커는 상세 요금 칸 정의가 없어 그대로`() {
        assertNull(PageFieldRead.fareOf(KakaoPickerPages.pages, Page.NEW_CALL, listOf("픽업지", "15,785")))
        val order = SimplifiedOfficeOrder(id = "p", fare = 15_785, money = com.onedal.app.models.CallMoney.ofIncome(15_785), timestamp = "t", pickupDetails = listOf(CallStop(listText = "")), dropoffDetails = listOf(CallStop(listText = "")))
        assertEquals(15_785, PageFieldRead.fareFirst(order, KakaoPickerPages.pages, Page.NEW_CALL, listOf("픽업지", "15,785")).fare)
        assertNotNull(order)
    }
}
