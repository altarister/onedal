package com.onedal.app.core

import com.onedal.app.core.engine.OrderRequirement
import com.onedal.app.models.SimplifiedOfficeOrder
import com.onedal.app.plugins.kakaopicker.KakaoPickerParser
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * 📋 **목록 완독에 상차지거리 — «모르면 통과» 없음** (기사님 «상차지 거리를 찾는 건 공통»)
 *
 * 상차지거리를 못 읽은 줄은 반경 조건을 건너뛰고 통과했다(픽커). 이제 그 줄은 그 스캔만 빼고 다음 스캔에 다시 본다.
 */
class ListCompleteTest {

    private fun codeOnly(path: String) = File(path).readText()
        .replace(Regex("/\\*[\\s\\S]*?\\*/"), "").replace(Regex("//.*"), "")

    private val root = "src/main/java/com/onedal/app"

    private fun order(km: Double?) = SimplifiedOfficeOrder(
        id = "t", type = "NEW_ORDER", pickup = "가나시 다라동", dropoff = "마바시 사아동",
        fare = 20000, timestamp = "2026-09-29T10:00:00", pickupDistance = km,
    )

    @Test
    fun `상차지거리가 없으면 목록 완독이 아니다`() {
        assertFalse(OrderRequirement.listComplete(order(null), allowsEmptyDropoff = false))
        assertTrue(OrderRequirement.listComplete(order(3.0), allowsEmptyDropoff = false))
    }

    @Test
    fun `픽커 - 상차지거리를 모르면 반경 조건을 통과하지 않는다`() {
        assertFalse(KakaoPickerParser.decide(order(null), minFare = 0, pickupRadiusKm = 10.0))
        assertTrue(KakaoPickerParser.decide(order(3.0), minFare = 0, pickupRadiusKm = 10.0))
    }

    @Test
    fun `세 파서에 상차지거리 모름=통과 가지가 없다 · 목록은 listComplete 로 본다`() {
        for (f in listOf("insung/InsungParser.kt", "hwamul24/Hwamul24Parser.kt", "kakaopicker/KakaoPickerParser.kt")) {
            assertFalse("$f 에 «상차지거리 모름=통과» 가지가 남아 있다",
                Regex("""pickupDistance\s*==\s*null""").containsMatchIn(codeOnly("$root/plugins/$f")))
        }
        assertTrue(codeOnly("$root/HijackService.kt").contains("OrderRequirement.listComplete("))
    }
}
