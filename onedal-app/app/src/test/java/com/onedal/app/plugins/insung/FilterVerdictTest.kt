package com.onedal.app.plugins.insung

import com.onedal.app.models.FilterConfig
import com.onedal.app.models.SimplifiedOfficeOrder
import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * 🧪 **필터 채점표 — 폰 없이 3초에 돈다** (기사님 확정)
 *
 * 폰 시험 한 번에 3분이 들고, 그 안에 **필터와 무관한** 실패 지점이 여섯 개 있다:
 *   지문 캐시 · 앱 바이너리 버전 · 차종 파싱 · 앱이 확정 중이라 리스트 못 봄 ·
 *   필터 값 바꿔 첫짐 탈락 · 손으로 잡을 때 주소 깨짐
 * 폰 시험으로는 그 여섯에 먼저 걸려 **정작 필터 판정을 못 보기 쉽다.**
 *
 * 판정은 원래 **(콜, 필터) → 통과/차단** 인 순수 계산이다. `InsungParser.decide` 가
 * 그 본체이고, 여기서는 문제지를 그대로 먹여 표로 채점한다.
 *
 * ⚠️ **이 검사가 대신하지 못하는 것** — 화면을 읽는 것(파싱)·GPS·경로·적재 흐름.
 *    폰 주행은 그걸 볼 때 쓴다. 필터 판정은 여기서 먼저 맞춘다 — 둘을 섞으면 어느 쪽 실패인지 못 가른다.
 *
 * 필터 값은 **서버 로그에서 그대로 떠 온 것**이다 (주행중 국면).
 * 지어내면 이 검사는 아무것도 증명하지 못한다.
 */
class FilterVerdictTest {

    /** 문제 한 줄 — 라벨·상하차·요금·차종·기대 */
    private data class Problem(
        val label: String,
        val pickup: String,
        val dropoff: String,
        val fare: Int,
        val vehicle: String,
        val deliveryKm: Double,
        val pickupKm: Double,
        val expect: Boolean,
        val why: String,
    )

    /**
     * 🛣️ **주행중 국면의 실제 필터** (서버 로그).
     *
     * `destinationKeywords` 는 **경유 ∪ 도착목표(첫짐의 여주시)** 다.
     * 여주 시내(교동·창동·홍문동…)와 **점동면**이 들어 있는 것이 그 증거다.
     * `orderKm` 은 **경유만** — 경로 위에서만 실을 수 있다는 뜻이고,
     * 도착목표로 들어온 동(점동면 등)은 여기 **없어야** 한다.
     */
    private fun driveFilter() = FilterConfig(
        allowedVehicleTypes = listOf("오토바이", "다마스", "라보", "승용차"),
        isActive = true,
        isSharedMode = true,                       // 합짐/주행중 — 상차 반경을 안 본다
        pickupRadiusKm = 10.0,
        minFare = 20000,
        maxFare = 1000000,
        ratePerKm = mapOf(
            "오토바이" to 485, "다마스" to 554, "라보" to 624, "승용차" to 624,
            "1t" to 693, "5t" to 1040,
        ),
        destinationCity = "여주시",
        destinationRadiusKm = 3.0,
        destinationKeywords = listOf(
            // 경유 — 경로가 밟는 동
            "태전동", "초월읍", "곤지암읍", "부발읍", "대월면", "신둔면", "가남읍",
            // 도착목표(여주시)에서 온 동 — 경로 밖이지만 **내릴 수는 있다**
            "세종대왕면", "상거동", "연라동", "점동면", "교동", "창동", "홍문동", "오학동",
        ),
        customCityFilters = listOf("광주시", "광주", "이천시", "이천", "여주시", "여주", "분당구", "분당"),
        orderKm = mapOf(
            "태전동" to 9.5, "초월읍" to 16.5, "곤지암읍" to 21.4,
            "부발읍" to 44.9, "대월면" to 40.2, "신둔면" to 33.0, "가남읍" to 48.5,
            // 🔴 점동면·세종대왕면은 **없다** — 경로 위가 아니다
        ),
    )

    private fun orderOf(p: Problem) = SimplifiedOfficeOrder(
        id = p.label, type = "NEW_ORDER",
        pickup = p.pickup, dropoff = p.dropoff, fare = p.fare,
        timestamp = "2026-08-25T13:11:00",
        vehicleType = p.vehicle,
        rawText = "${p.pickup} ${p.dropoff}",
        pickupDistance = p.pickupKm, deliveryDistance = p.deliveryKm,
    )

    /**
     * 문제지 「서현여주」의 주행중 구간 — 마지막 하차만 남았을 때 오는 콜들.
     * 시뮬레이터 문제지(`onedal-sim/packages/core-simulator/src/presets.ts`)에는 이 콜들이 없다 — 이 표가 원본이다.
     */
    private val problems = listOf(
        Problem("⑧ 대조군(경유 안) · 가남 → 세종대왕면", "가남읍", "여주시 세종대왕면", 30000, "승", 6.8, 34.7,
            expect = true, why = "하차지가 경유 목록에 있다"),
        Problem("⑨ 본문제(경유 밖) · 가남 → 점동면", "가남읍", "여주시 점동면", 30000, "승", 8.7, 34.7,
            expect = true, why = "🔴 경유 밖이지만 **도착목표(여주) 안**이라 내릴 수 있어야 한다"),
        Problem("⑦ 복귀 합짐 · 점동면 → 분당 정자", "여주시 점동면", "분당구 정자동", 64000, "라", 52.0, 43.0,
            expect = false, why = "🔴 상차지가 경로 밖 — 도착목표는 **하차지만** 연다"),
        Problem("④ 큰 차 · 태전동 → 곤지암", "광주시 태전동", "광주시 곤지암읍", 200000, "5t", 11.7, 4.1,
            expect = false, why = "차종 미달 — 5t 는 허용 목록에 없다"),
        Problem("⑤ 싼 콜 · 초월읍 → 부발읍", "광주시 초월읍", "이천시 부발읍", 8000, "다", 25.0, 3.9,
            expect = false, why = "단가 미달 — 25km × 554 = 13,850 > 8,000"),
        Problem("⑥ 복귀 · 가남 → 성남 야탑", "가남읍", "분당구 야탑동", 49000, "다", 44.6, 34.7,
            expect = false, why = "하차지 분당구가 도착목표(여주) 밖 — 복귀는 별도 사이클(설계 §8)"),
    )

    @Test
    fun `주행중 필터 채점표`() {
        val filter = driveFilter()
        val fails = mutableListOf<String>()

        println("\n━━━ 주행중 국면 필터 채점 (문제지 「서현여주」) ━━━")
        for (p in problems) {
            val actual = InsungParser.decide(orderOf(p), filter)
            val ok = actual == p.expect
            val mark = if (ok) "✅" else "❌"
            println("$mark ${p.label}")
            println("     기대 ${verdict(p.expect)} · 실제 ${verdict(actual)} — ${p.why}")
            if (!ok) fails += p.label
        }
        println("━━━ ${problems.size - fails.size}/${problems.size} 통과 ━━━\n")

        assertEquals("어긋난 문제: $fails", emptyList<String>(), fails)
    }

    private fun verdict(b: Boolean) = if (b) "잡음" else "거름"

    /**
     * 🔴 **도착목표는 하차지만 연다** — 상차지는 끝까지 경로 위여야 한다.
     *
     * 상차지까지 도착목표로 열면 이미 지나온 곳(수십 km 뒤)으로 돌아가 실어야 하는 콜이
     * 통과한다. 도착목표는 하차지 쪽에만 더한다.
     */
    @Test
    fun `도착목표로 들어온 동에서는 실을 수 없다`() {
        val filter = driveFilter()

        val 실으러가기 = SimplifiedOfficeOrder(
            id = "x", pickup = "여주시 점동면", dropoff = "가남읍", fare = 50000,
            timestamp = "2026-08-25T13:11:00", vehicleType = "다",
            rawText = "여주시 점동면 가남읍", pickupDistance = 20.0, deliveryDistance = 8.7,
        )
        assertEquals(false, InsungParser.decide(실으러가기, filter))

        val 내리러가기 = SimplifiedOfficeOrder(
            id = "y", pickup = "가남읍", dropoff = "여주시 점동면", fare = 30000,
            timestamp = "2026-08-25T13:11:00", vehicleType = "다",
            rawText = "가남읍 여주시 점동면", pickupDistance = 1.0, deliveryDistance = 8.7,
        )
        assertEquals(true, InsungParser.decide(내리러가기, filter))
    }

    /**
     * 🚚 승용차는 인성 화면에서 «승」이다. 필터의 «승용차»가 «승»과 맞물리지 않으면
     * 승용차 콜이 **로그도 없이 조용히 걸러진다**.
     */
    @Test
    fun `승용차는 승으로 판정된다`() {
        val filter = driveFilter()
        val 승용차콜 = SimplifiedOfficeOrder(
            id = "z", pickup = "가남읍", dropoff = "여주시 세종대왕면", fare = 30000,
            timestamp = "2026-08-25T13:11:00", vehicleType = "승",
            rawText = "가남읍 세종대왕면", pickupDistance = 34.7, deliveryDistance = 6.8,
        )
        assertEquals(true, InsungParser.decide(승용차콜, filter))
    }

    /**
     * 🔒 **«선점 중»은 «만석»과 다르다 — 판정까지는 돈다** (기사님 · 실주행 04:58 오송읍).
     *
     * 앱은 판정 첫 줄에서 `isActive` 하나만 보고 돌아선다. 그런데 서버는 그 스위치를 두 뜻으로 끈다 —
     * **만석**(실을 차종 없음 · 하차해야 풀림)과 **선점 중**(한 콜을 심사 중 · 몇 초면 풀림)이다.
     *
     * 그 바람에 오송읍에서 콜 넷이 목록에 보이는데도 10초마다 이렇게만 찍혔다:
     *   🔒 [평가 보류] 오송읍 → 성곡동 39000원 — 필터 잠김(선점 중·대기)
     * 셋을 잡는 데 **3분 25초**. 실제 배차망이면 그 사이 다 뺏긴다.
     *
     * 🔴 **판정과 클릭은 다른 일이다.** 선점 중이어도 판정은 해 둬야 앞 콜이 결재되는 즉시 다음을 잡는다.
     *    클릭을 미루는 것은 `HijackService` 가 한다 — 여기서는 «판정이 돈다»만 본다.
     * 🔴 만석(`isActive=false`)은 그대로 막는다 — 기사님 «1톤 두 개는 사고».
     */
    @Test
    fun `선점 중이어도 판정은 돈다 — 잠긴 것은 만석뿐이다`() {
        val order = SimplifiedOfficeOrder(
            id = "t-eval", pickup = "오송읍", dropoff = "성곡동",
            fare = 39000, vehicleType = "오토바이", type = "AUTO", timestamp = "2026-09-24T04:58:00+09:00",
        )
        /* 콜 잡기는 켜져 있고, 지금 다른 콜을 심사 중이다 */
        val f = driveFilter().copy(isActive = true, evaluatingNow = true)
        org.junit.Assert.assertNotEquals("locked", InsungParser.judge(order, f).axis)
    }

    @Test
    fun `만석이면 지금처럼 잠긴다`() {
        val order = SimplifiedOfficeOrder(
            id = "t-full", pickup = "오송읍", dropoff = "성곡동",
            fare = 39000, vehicleType = "오토바이", type = "AUTO", timestamp = "2026-09-24T04:58:00+09:00",
        )
        val f = driveFilter().copy(isActive = false)
        assertEquals("locked", InsungParser.judge(order, f).axis)
    }
}

/**
 * 🏠 **주소처럼 안 생긴 글자는 주소로 쓰지 않는다** — «배차값없음» 으로 둔다
 *
 * `parse()` 의 *"첫 번째 유효 지역 = 상차지"* 규칙은 **리스트에서만 참**이다. 손으로 연
 * 상세에 그대로 쓰면 상차지 **«다마스»**, 하차지 **«계산서필»** 같은 낱말이 장부에 남고,
 * 값이 비어 있지 않으니 폴백도 안 걸린다. 그래서 `looksLikeAddress` 로 거른다.
 *
 * 직접콜은 서버가 심사하지 않으므로(규칙 ①) 그 값이 **경로의 기점**이 된다.
 */
class AddressShapeTest {

    @Test
    fun `실측으로 나온 오파싱 낱말을 거른다`() {
        for (bad in listOf("다마스", "계산서필", "라보", "요금", "적요", "확정")) {
            org.junit.Assert.assertFalse(bad, InsungParser.looksLikeAddress(bad))
        }
    }

    @Test
    fun `진짜 주소는 통과한다`() {
        for (ok in listOf(
            "경기 광주시 초월읍", "여주시 가남읍", "성남시 분당구", "곤지암읍",
            "경기 광주시 고불로 264", "본두1길 17-50", "태전동",
        )) {
            org.junit.Assert.assertTrue(ok, InsungParser.looksLikeAddress(ok))
        }
    }

}
