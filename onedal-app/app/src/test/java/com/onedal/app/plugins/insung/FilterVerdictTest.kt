package com.onedal.app.plugins.insung

import com.onedal.app.models.FilterConfig
import com.onedal.app.models.SimplifiedOfficeOrder
import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * 🧪 **필터 채점표 — 폰 없이 3초에 돈다** (기사님 확정 2026-08-25)
 *
 * 기사님: *"도대체 어떻게 하면 필터가 잘 작동하는지 확인할 수 있는 거야.
 * 지금 이것만 2시간 동안 하고 있어."*
 *
 * 폰으로 한 판 도는 데 3분인데, 그 안에 **필터와 무관한** 실패 지점이 여섯 개 있다:
 *   지문 캐시 · 앱 바이너리 버전 · 차종 파싱 · 앱이 확정 중이라 리스트 못 봄 ·
 *   필터 값 바꿔 첫짐 탈락 · 손으로 잡을 때 주소 깨짐
 * 2026-08-25 에 그 여섯을 하나씩 다 밟았고 **정작 필터 판정은 한 번도 못 봤다.**
 *
 * 판정은 원래 **(콜, 필터) → 통과/차단** 인 순수 계산이다. `InsungParser.decide` 가
 * 그 본체이고, 여기서는 문제지를 그대로 먹여 표로 채점한다.
 *
 * ⚠️ **이 검사가 대신하지 못하는 것** — 화면을 읽는 것(파싱)·GPS·경로·적재 흐름.
 *    폰 주행은 그걸 볼 때 쓴다. 둘을 섞으면 2026-08-25 처럼 하루가 간다.
 *
 * 필터 값은 **서버 로그에서 그대로 떠 온 것**이다 (2026-08-25 13:11 주행중 국면).
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
     * 🛣️ **주행중 국면의 실제 필터** (2026-08-25 13:11 서버 로그).
     *
     * `destinationKeywords` 는 **경유 ∪ 도착목표(첫짐의 여주시)** 다 — 2026-08-25 수정분.
     * 여주 시내(교동·창동·홍문동…)와 **점동면**이 들어 있는 것이 그 증거다.
     * `progressKm` 은 **경유만** — 경로 위에서만 실을 수 있다는 뜻이고,
     * 도착목표로 들어온 동(점동면 등)은 여기 **없어야** 한다.
     */
    private fun driveFilter() = FilterConfig(
        allowedVehicleTypes = listOf("오토바이", "다마스", "라보", "승용차"),
        isActive = true,
        isSharedMode = true,                       // 합짐/주행중 — 상차 반경을 안 본다
        pickupRadiusKm = 10,
        minFare = 20000,
        maxFare = 1000000,
        ratePerKm = mapOf(
            "오토바이" to 485, "다마스" to 554, "라보" to 624, "승용차" to 624,
            "1t" to 693, "5t" to 1040,
        ),
        destinationCity = "여주시",
        destinationRadiusKm = 3,
        destinationKeywords = listOf(
            // 경유 — 경로가 밟는 동
            "태전동", "초월읍", "곤지암읍", "부발읍", "대월면", "신둔면", "가남읍",
            // 도착목표(여주시)에서 온 동 — 경로 밖이지만 **내릴 수는 있다**
            "세종대왕면", "상거동", "연라동", "점동면", "교동", "창동", "홍문동", "오학동",
        ),
        customCityFilters = listOf("광주시", "광주", "이천시", "이천", "여주시", "여주", "분당구", "분당"),
        progressKm = mapOf(
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
     * 라벨·주소·요금은 `onedal-sim/packages/core-simulator/src/presets.ts` 와 같다.
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
     * 2026-08-18 실사고: 파주 도착 직전 `초월읍 → 금촌동` 이 통과했다. 78km 뒤로
     * 돌아가 실어야 하는 콜이었다. 도착목표를 넣으면서 이 방어가 뚫리면 그게 재발한다.
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
     * 🚚 승용차는 인성 화면에서 «승」이다. 차종 목록이 세 벌로 갈라져 있던 탓에
     * 2026-08-25 에 승용차 콜이 **카드 그룹조차 안 만들어졌다** (로그도 안 남았다).
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
}

/**
 * 🏠 **주소처럼 안 생긴 글자는 주소로 쓰지 않는다** (기사님 실측 2026-08-25 13:23)
 *
 * 손으로 연 상세에서 상차지 **«다마스»**, 하차지 **«계산서필»** 이 장부에 남았다.
 * `parse()` 의 *"첫 번째 유효 지역 = 상차지"* 규칙은 **리스트에서만 참**인데
 * 상세 화면에 그대로 썼기 때문이다. 값이 비어 있지 않으니 폴백도 안 걸렸다.
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
