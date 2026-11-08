package com.onedal.app.plugins.isflex

import com.onedal.app.core.OpenBlocked
import com.onedal.app.core.TapShift
import com.onedal.app.core.engine.AddressForm
import com.onedal.app.core.engine.ReservationGate
import com.onedal.app.models.FilterConfig
import com.onedal.app.models.SimplifiedOfficeOrder
import com.onedal.app.plugins.ListTap
import com.onedal.app.plugins.isflex.IsflexRealScreens.D08
import com.onedal.app.plugins.isflex.IsflexRealScreens.D09
import com.onedal.app.plugins.isflex.IsflexRealScreens.D10
import com.onedal.app.plugins.isflex.IsflexRealScreens.D11
import com.onedal.app.plugins.isflex.IsflexRealScreens.D12
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDateTime
import com.onedal.app.core.firstPickupStop
import com.onedal.app.core.lastDropoffStop
import com.onedal.app.core.StopText
import com.onedal.app.core.TargetApp
import com.onedal.app.core.withLastDropoff

/**
 * 📄 **인성플렉스 파서 — 실물 기대값** (실물 ex_images/인성플렉스 02 · 07 목록 · 08~12 상세 · 03~06 콜이 없는 장).
 * 목록 줄 11(누를 자리 포함) · 상세 5 · 목록 줄 대조 5 · 줄 0 장 5 · 판정 6 + 단가 차종 고르기.
 * 못 잡는 것: 그 자리를 누르면 상세가 실제로 열리나(폰) · 실물에 없는 꼴(오늘 예약 앞글자 · 쉼표 없는 요금 · 위로 잘린 줄의 노드 자리).
 */
class IsflexParserTest {
    private val now = LocalDateTime.of(2026, 10, 30, 20, 0)

    /** 한 줄 기대값 — 예약은 (날, 시각) · 예약 아님은 null */
    private data class Want(
        val pickup: String, val dropoff: String, val fare: Int, val pickupKm: Double?, val deliveryKm: Double?,
        val vehicle: String?, val schedule: String?, val reserved: Pair<Int, String>?, val tags: String?, val tapY: Int? = null,
    )

    private fun rowsOf(cells: List<IsflexRowGrouping.Cell>): List<Pair<SimplifiedOfficeOrder, Int>> =
        IsflexRowGrouping.rows(cells).map { r ->
            IsflexParser.parseList(r.members.map { cells[it].text }, IsflexParser.NOISE_WORDS, now) to cells[r.fareIndex].centerY
        }

    private fun assertOrder(label: String, w: Want, o: SimplifiedOfficeOrder) {
        assertEquals("$label 상차", w.pickup, StopText.query(TargetApp.ISFLEX, firstPickupStop(o)))
        assertEquals("$label 하차", w.dropoff, StopText.query(TargetApp.ISFLEX, lastDropoffStop(o)))
        assertEquals("$label 요금", w.fare, o.fare)
        assertEquals("$label 출발지까지", w.pickupKm, firstPickupStop(o)?.distanceKm)
        assertEquals("$label 운행 거리", w.deliveryKm, lastDropoffStop(o)?.distanceKm)
        assertEquals("$label 차종", w.vehicle, o.vehicleType)
        assertEquals("$label 예약 글자", w.schedule, firstPickupStop(o)?.promiseText)
        assertEquals("$label 예약", w.reserved != null, o.reserved == true)
        assertEquals("$label 예약 날", w.reserved?.first, firstPickupStop(o)?.requestedDay)
        assertEquals("$label 예약 시각", w.reserved?.second, firstPickupStop(o)?.requestedTime)
        assertEquals("$label 꼬리표", w.tags, o.tagsText)
    }

    /** 👆 누를 자리 — x 는 줄 틀(`cl_new_order` [0,…][1080,…]) 왼끝 + 안쪽 여백 · y 는 요금 가운데 · 안전 확인을 통과한다 */
    private fun assertTap(label: String, cells: List<IsflexRowGrouping.Cell>, wantY: Int, fareY: Int) {
        assertEquals("$label 누를 x", 40, TapShift.rowLeftOf(0))
        assertEquals("$label 누를 y", wantY, fareY)
        assertNull("$label 누르기 전 확인", IsflexPlugin.holdOf(cells.map { it.text }, fareY, fareY))
        assertEquals(ListTap(rowLeft = true, delayMs = TapShift.PREVIEW_MS, dy = 0), IsflexPlugin.LIST_TAP)
    }

    private val want02 = listOf(
        Want("수원 이의동", "쌍림동", 21252, 24.3, 30.1, "오토", "낼08:20", 1 to "08:20", "10:20전", 1132),
        Want("방배동", "성수동1가", 10626, 28.1, 8.8, "오토", "낼8:30", 1 to "08:30", "선불", 1396),
        Want("충무로5가", "구리 수택동", 13459, 32.9, 13.0, "오토", "낼09시", 1 to "09:00", null, 1730),
        Want("남대문로2가", "상암동", 17710, 34.2, 8.7, "오토", null, null, "착불", 1994),
    )

    private val want07 = listOf(
        Want("수원 이의동", "쌍림동", 21252, 24.3, 30.1, "오토", "낼08:20", 1 to "08:20", "10:20전", 835),
        Want("역삼동", "대치동", 8500, 26.5, 2.3, "오토", null, null, "착불", 1009),
        Want("반포동", "신천동", 15584, 27.8, 6.8, "오토", "낼06:50", 1 to "06:50", null, 1254),
        Want("방배동", "성수동1가", 10626, 28.1, 8.8, "오토", "낼8:30", 1 to "08:30", "선불", 1428),
        Want("충무로5가", "김포 통진읍", 21252, 32.9, 38.0, "오토", "낼09시", 1 to "09:00", null, 1673),
        Want("충무로5가", "구리 수택동", 13459, 32.9, 13.0, "오토", "낼09시", 1 to "09:00", null, 1907),
        Want("동패동", "운서동", 10626, 60.4, 38.2, "오토", null, null, null, 2110),
    )

    @Test fun `목록 02 — 줄 넷 · 칩 · 띠 · 칸 머리는 자리로 빠진다`() {
        val rows = rowsOf(IsflexRealScreens.LIST_02)
        assertEquals(4, rows.size)
        rows.forEachIndexed { i, (o, y) ->
            assertOrder("02-${i + 1}", want02[i], o)
            assertTap("02-${i + 1}", IsflexRealScreens.LIST_02, want02[i].tapY!!, y)
        }
    }

    @Test fun `목록 07 — 밀어 내린 목록 줄 일곱`() {
        val rows = rowsOf(IsflexRealScreens.LIST_07)
        assertEquals(7, rows.size)
        rows.forEachIndexed { i, (o, y) ->
            assertOrder("07-${i + 1}", want07[i], o)
            assertTap("07-${i + 1}", IsflexRealScreens.LIST_07, want07[i].tapY!!, y)
        }
    }

    /** 상세 다섯 — 칸 읽기(정의 표 읽는 법)로 다듬은 값 · 손으로 연 상세(`parse`)와 같다 */
    private val wantDetail = listOf(
        Triple(D08, Want("서울 강남구 역삼동", "서울 강남구 대치동", 8500, 26.7, 2.3, "오토", null, null, "착불"), Triple(null, "1박스 3층 계단물건 있음", "착불")),
        Triple(D09, Want("서울 서초구 방배동", "서울 성동구 성수동1가", 10626, 28.3, 9.0, "오토", "낼8:30", 1 to "08:30", "선불"), Triple(null, "/내일8:30분후. 10시도착/박스1개)   친절하게 부탁합", "선불")),
        Triple(D10, Want("경기 수원시 영통구 이의동", "서울 중구 쌍림동", 21252, 24.4, 31.0, "오토", "낼08:20", 1 to "08:20", "과적 10:20전"), Triple("과적", "과적 아이스박스1(제품샘플)-착지시간꼭엄수/다른 곳 들르", null)),
        Triple(D11, Want("서울 서초구 반포동", "서울 송파구 신천동", 15584, 28.0, 6.8, "오토", "낼06:50", 1 to "06:50", null), Triple(null, "큰봉투1개(80L이하)/낼06:50픽업/7시 40분까지 배송", null)),
        Triple(D12, Want("경기 파주시 동패동", "인천 영종구 운서동", 10626, 61.0, 38.8, "오토", null, null, null), Triple(null, null, null)),
    )

    @Test fun `상세 다섯 — 칸 읽기 · 손 상세 · 전체 주소`() {
        val pages = IsflexPages.pages
        val page = com.onedal.app.core.Page.NEW_CALL
        for ((i, row) in wantDetail.withIndex()) {
            val (texts, w, fields) = row
            val label = "상세 ${8 + i}"
            val detail = IsflexParser.detailTextsOf(texts)
            assertEquals("$label 머리 · 지도 설명을 뗀다", "출발지까지", detail.first())
            val o = IsflexPlugin().parser.parse(detail)
            assertOrder(label, w, o)
            assertEquals("$label 꼬리표 칸", fields.first, com.onedal.app.core.PageFieldRead.fieldOf(pages, page, com.onedal.app.core.PageField.TAGS, detail))
            assertEquals("$label 적요 칸", fields.second, com.onedal.app.core.PageFieldRead.fieldOf(pages, page, com.onedal.app.core.PageField.MEMO, detail))
            assertEquals("$label 결제 칸", fields.third, com.onedal.app.core.PageFieldRead.fieldOf(pages, page, com.onedal.app.core.PageField.PAYMENT, detail))
            assertTrue("$label 상차 전체 주소", AddressForm.isFull(StopText.query(TargetApp.ISFLEX, firstPickupStop(o))))
            assertTrue("$label 하차 전체 주소", AddressForm.isFull(StopText.query(TargetApp.ISFLEX, lastDropoffStop(o))))
        }
    }

    /** 🏠 앱이 연 콜을 상세로 채운다 — 주소 · 예약 · 꼬리표는 상세 값 · 출발지까지는 목록 값(시간이 흐르면 바뀐다) */
    @Test fun `상세 채우기 — 목록 07 줄을 상세 글로`() {
        val list = rowsOf(IsflexRealScreens.LIST_07).map { it.first }
        val pairs = listOf(D08 to 1, D09 to 3, D10 to 0, D11 to 2, D12 to 6)
        for ((texts, row) in pairs) {
            val detail = IsflexParser.detailTextsOf(texts)
            val w = wantDetail.first { it.first === texts }.second
            val filled = IsflexParser.fillFromDetail(list[row].copy(rawText = detail.joinToString(" ")), now)
            assertOrder("채움 07-${row + 1}", w.copy(pickupKm = firstPickupStop(list[row])?.distanceKm, deliveryKm = lastDropoffStop(list[row])?.distanceKm), filled)
        }
    }

    @Test fun `목록 줄 대조 — 요금이 같은 줄이 둘이면 출발 동으로 가른다`() {
        val recent = rowsOf(IsflexRealScreens.LIST_07).map { it.first }
        val expected = listOf(D08 to 1, D09 to 3, D10 to 0, D11 to 2, D12 to 6)
        val parser = IsflexPlugin().parser
        for ((texts, row) in expected) {
            val hit = parser.matchDetailOrder(IsflexParser.detailTextsOf(texts), recent)
            assertEquals("${texts.first()} → 07-${row + 1}", recent[row], hit)
        }
    }

    @Test fun `콜이 0 이어야 하는 장 — 칸 머리 «수입»이 없다`() {
        assertEquals("06 견본 시트", 0, IsflexRowGrouping.rows(IsflexRealScreens.SHEET_06).size)
        assertEquals("05 거리 시트", 0, IsflexRowGrouping.rows(IsflexRealScreens.SHEET_05).size)
        assertEquals("04 진행중(빈)", 0, IsflexRowGrouping.rows(IsflexRealScreens.ONGOING_04).size)
        assertEquals("03 지도", 0, IsflexRowGrouping.rows(IsflexRealScreens.MAP_03).size)
        assertEquals("08 상세 좌표 노드", 0, IsflexRowGrouping.rows(IsflexRealScreens.DETAIL_08_CELLS).size)
    }

    // ── 판정 ──
    private val on = FilterConfig(isActive = true, minFare = 6000, destinationKeywords = listOf("대치동"), pickupKeywords = listOf("역삼동"))
    private val row07 by lazy { rowsOf(IsflexRealScreens.LIST_07).map { it.first } }

    @Test fun `판정 — 차종 표 · 빈 하차 목록 · 상차 목록 · 제외어는 적요와 꼬리표만`() {
        val o2 = row07[1]
        assertEquals("오토 → 오토바이 허용", "pass", IsflexParser.judge(o2, on.copy(allowedVehicleTypes = listOf("오토바이"), minFare = 8000)).axis)
        assertEquals("다마스만 허용", "vehicle", IsflexParser.judge(o2, on.copy(allowedVehicleTypes = listOf("다마스"))).axis)
        assertEquals("빈 하차 목록 = 보류", "region", IsflexParser.judge(o2, on.copy(destinationKeywords = emptyList())).axis)

        val tomorrow = on.copy(destinationKeywords = listOf("쌍림동"), pickupKeywords = listOf("이의동"), reservationMode = ReservationGate.TOMORROW_TOO)
        assertEquals("«수원 이의동» ⊃ «이의동»", "pass", IsflexParser.judge(row07[0], tomorrow).axis)

        val d10 = IsflexParser.parseDetail(IsflexParser.detailTextsOf(D10), now)
        assertEquals("상세 10 꼬리표 · 적요 «과적»", "blacklist", IsflexParser.judge(d10, tomorrow.copy(excludedKeywords = listOf("과적"))).axis)
        val d08 = IsflexParser.parseDetail(IsflexParser.detailTextsOf(D08), now)
        assertEquals("주소 «강남»은 제외어를 안 본다", "pass", IsflexParser.judge(d08, on.copy(excludedKeywords = listOf("강남"))).axis)
    }

    /** 💰 단가 바닥은 기사님 차종 — 🔴 기사님 차종을 못 받았으면(null) 콜 화면 차종 단가로 선다(단가 판정이 꺼지지 않는다) */
    @Test fun `단가 — 기사님 차종이 없으면 화면 차종 «오토»의 오토바이 단가로 선다`() {
        // 20km · 16,000원 = km 당 800원 — 오토바이 700 은 넘고 1t 1000 은 못 넘는다 · 승용차 900 도 못 넘는다
        val o = withLastDropoff(row07[1].copy(fare = 16000)) { it.copy(distanceKm = 20.0) }
        val rates = on.copy(ratePerKm = mapOf("오토바이" to 700, "승용차" to 900, "1t" to 1000))
        assertEquals("기사님 차종 1t", "fare", IsflexParser.judge(o, rates.copy(driverVehicleType = "1t")).axis)
        assertEquals("기사님 차종 없음 → 오토바이 700", "pass", IsflexParser.judge(o, rates.copy(driverVehicleType = null)).axis)
        assertEquals("기사님 차종 없음 · 화면 차종 오토바이 단가도 못 넘으면", "fare", IsflexParser.judge(o.copy(fare = 13000), rates.copy(minFare = 6000, driverVehicleType = null)).axis)
    }

    @Test fun `누르기 전 확인 — 수행하기가 보이거나 칸 머리가 없거나 줄이 움직이면 안 누른다`() {
        val list = IsflexRealScreens.LIST_07.map { it.text }
        assertEquals(OpenBlocked.ACCEPT_VISIBLE, IsflexPlugin.holdOf(list + "8,500원 \n수행하기", 1009, 1009))
        assertEquals(OpenBlocked.NOT_UNDER_HEADER, IsflexPlugin.holdOf(IsflexRealScreens.SHEET_06.map { it.text }, 1138, 1138))
        assertEquals(OpenBlocked.TAP_RECHECK, IsflexPlugin.holdOf(list, 1009, null))
        assertEquals(OpenBlocked.LIST_MOVING, IsflexPlugin.holdOf(list, 1009, 1100))
    }
}
