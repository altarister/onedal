package com.onedal.app.plugins.insung

import com.onedal.app.models.FilterConfig
import com.onedal.app.models.SimplifiedOfficeOrder
import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * 🚚 **1t 차에 5t 짐을 실을 수 없다** (기사님 실측 2026-08-26)
 *
 * 기사님: *"지금 잘못 잡은 거 같은데?"*
 *
 * 문제지 ③(막아야 하는 5t 콜)이 **잡혔다.** 로그캣:
 *
 *     🔍 [타겟 콜 필터 결과] 차종(5t)=✅ 도착지(25중 호법면)=✅ … → 💥 꿀콜 조건 통과!
 *
 * 서버가 내려준 목록에는 5t 가 없었다:
 *     allowedVehicleTypes: ["오토바이","다마스","라보","승용차","1t"]
 *
 * 앱의 판정이 이랬다:
 *
 *     "1t" -> normParsed.contains("1") || normParsed.contains("t") || normParsed.contains("톤")
 *
 * 🔴 **허용에 `1t` 가 있으면 `t` 가 든 차종이 전부 통과한다** — 5t·2.5t·11t·25t 까지.
 *    `contains("1")` 은 11t·1.4t 도 열어 준다.
 *
 * ── 왜 이게 큰 사고인가 ──
 * 잘못 잡은 5t 한 건이 **적재를 채워** 뒤에 오는 콜이 전부 «자리 없음»으로 떨어졌다.
 * 문제지 ④⑤⑥⑦ 이 모두 `차종(다)=❌` 로 막혔고 **첫짐조차 못 잡았다.** 한 축의 오판이
 * 판 전체를 무너뜨린다. 실주행이었다면 취소 1회(배차망 10회 한도)를 태우는 콜이다.
 *
 * ⚠️ 규칙 ⑤(*"앱은 느슨하게 올린다"*)와 어긋나지 않는다 — **느슨한 것과 틀린 것은 다르다.**
 *    실을 수 없는 차종은 «애매한 콜»이 아니라 **불가능한 콜**이다.
 */
class VehicleAxisTest {

    /** 차종 축만 남기고 나머지는 전부 통과하게 둔 필터 (첫짐 국면) */
    private fun filterAllowing(vararg types: String) = FilterConfig(
        allowedVehicleTypes = types.toList(),
        isActive = true,
        isSharedMode = true,             // 상차 반경을 안 본다 — 차종 축만 보려고
        minFare = 0,
        maxFare = 10_000_000,
        destinationKeywords = listOf("호법면"),
        customCityFilters = listOf("이천시", "이천"),
    )

    private fun call(vehicle: String) = SimplifiedOfficeOrder(
        id = "v-$vehicle", type = "NEW_ORDER",
        pickup = "광주시 초월읍", dropoff = "이천시 호법면", fare = 210_000,
        timestamp = "2026-08-26T07:10:30",
        vehicleType = vehicle,
        rawText = "광주시 초월읍 이천시 호법면",
        pickupDistance = 7.2, deliveryDistance = 15.5,
    )

    /** 서버가 1t 차에게 실제로 내려주는 목록 (2026-08-26 07:06 서버 로그) */
    private fun oneTonFilter() = filterAllowing("오토바이", "다마스", "라보", "승용차", "1t")

    @Test
    fun `1t 허용은 더 큰 톤수를 열어 주지 않는다`() {
        val f = oneTonFilter()
        // 🔴 실측으로 잡혔던 그 콜
        assertEquals("5t 는 1t 차에 못 싣는다", false, InsungParser.decide(call("5t"), f))
        for (bigger in listOf("2.5t", "3.5t", "11t", "14t", "18t", "25t", "1.4t")) {
            assertEquals("$bigger 는 1t 차에 못 싣는다", false, InsungParser.decide(call(bigger), f))
        }
    }

    @Test
    fun `허용된 차종은 그대로 통과한다`() {
        val f = oneTonFilter()
        // 인성 리스트는 한 글자로 준다 — 다·오·라·승
        for (ok in listOf("1t", "다", "오", "라", "승")) {
            assertEquals("$ok 는 실을 수 있다", true, InsungParser.decide(call(ok), f))
        }
    }

    @Test
    fun `허용 목록이 좁아지면 그만큼만 통과한다 (적재가 차면 서버가 좁힌다)`() {
        // 다마스 3건을 실어 90/100 이 되면 서버는 오토바이·승용차만 남긴다
        val tight = filterAllowing("오토바이", "승용차")
        assertEquals(false, InsungParser.decide(call("다"), tight))
        assertEquals(false, InsungParser.decide(call("1t"), tight))
        assertEquals(true, InsungParser.decide(call("승"), tight))
        assertEquals(true, InsungParser.decide(call("오"), tight))
    }

    @Test
    fun `빈 목록은 전체 허용 — 서버가 아직 안 내려준 상태의 안전망`() {
        val none = filterAllowing()
        assertEquals(true, InsungParser.decide(call("5t"), none))
    }
}
