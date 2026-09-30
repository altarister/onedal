package com.onedal.app.core

import com.onedal.app.models.SimplifiedOfficeOrder
import com.onedal.app.plugins.kakaopicker.KakaoPickerParser
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * 🔍 **오늘 배포분 리뷰 묶음(앱 몫)** — onedal-ab 리뷰 · 04 리뷰 에이전트 · onedal-1f «가».
 * 1 빈 내일 상차 목록([])이 내일 콜을 전부 떨어뜨렸다 · 3 넘긴 누르기가 뒤 보류·심사 중을 모르고 900ms 묵은 노드로 쐈다 ·
 * 4 빨리 접기 전 상세를 만진 손이 안 잡혔다 · 5 내일 상차에 도착용 시 별칭이 섞였다 · 6 «탭 줄 못 찾음»을 손 필요(tabBar)로 보냈다.
 */
class BundleReviewTest {
    private fun call(pickup: String, km: Double) = SimplifiedOfficeOrder(id = "c", pickup = pickup, dropoff = "서대문 신촌", fare = 10000,
        timestamp = "t", pickupDistance = km, reserved = true, reservedDay = 1)
    private fun pickupOk(o: SimplifiedOfficeOrder, list: List<String>?, aliases: List<String> = emptyList(), groups: Map<String, List<String>>? = null, reservedRadius: Double? = 25.0) =
        KakaoPickerParser.decideAxes(o, 6000, 16.87, cityAliases = aliases, reservationMode = "tomorrowToo", reservedPickupRadiusKm = reservedRadius,
            reservedPickupKeywords = list, reservedPickupGroups = groups).pickup

    @Test fun `1 빈 목록은 없는 것처럼 - 반경 길`() {
        assertTrue(pickupOk(call("송파 문정2", 20.0), emptyList(), reservedRadius = 25.0))
        assertFalse(pickupOk(call("송파 문정2", 30.0), emptyList(), reservedRadius = 25.0))
    }

    @Test fun `5 도착용 시 별칭을 섞지 않는다`() =
        assertFalse("목록 밖 송파 문정2 가 별칭 «송파»로 통과했다", pickupOk(call("송파 문정2", 3.0), listOf("삼평동"), aliases = listOf("송파")))

    @Test fun `5 groups 로 시군구를 가른다`() {
        val groups = mapOf("성남시 분당구" to listOf("삼평동"))
        assertTrue(pickupOk(call("분당 삼평", 16.9), listOf("삼평동"), groups = groups))
        assertEquals(listOf("성남시 분당구", "성남시", "분당구", "성남", "분당"), KakaoPickerParser.sigunguFormsOf("성남시 분당구"))
    }

    @Test fun `6 탭 줄을 못 찾으면 held`() {
        val nodes = listOf(Triple("퀵 오더카드 대기 중.", 120, 280), Triple("18,130", 1750, 1806))
        assertEquals(OpenBlocked.HELD, KakaoPickerParser.scrolledRowTapBlock(nodes, 1778)?.key)
    }

    private val svc by lazy { File("src/main/java/com/onedal/app/HijackService.kt").readText() }

    @Test fun `3 넘긴 누르기 - 보류하는 읽기가 거둔다 · 넘겨받은 쪽이 심사 중을 보고 새로 읽는다`() {
        assertTrue(svc.contains("waitBook.cancel(\"누르기 넘김\")"))
        val handoff = svc.substringAfter("waitBook.schedule(\"누르기 넘김\"").substringBefore("performSimulatedTouch(")
        assertTrue(handoff.contains("EvaluatingNow.of("))
        assertTrue(handoff.contains("freshScreenNodes()"))
        val plugin = File("src/main/java/com/onedal/app/plugins/kakaopicker/KakaoPickerPlugin.kt").readText()
        assertTrue("머리줄 길도 창 전체 재검색", plugin.substringAfter("override fun planListTap(").substringBefore("private fun planScrolledTap(").contains("offerSignInWindow("))
    }

    @Test fun `4 빨리 접기 전 상세 손도 기억한다`() {
        val release = svc.substringAfter("private fun releaseFoldOnHand(").substringBefore("\n    }")
        assertTrue(release.contains("session.openedByApp"))
        assertFalse("빨리 접기가 안 걸렸어도 기억한다", release.contains("val orderId = detailFoldOrderId ?: return"))
    }
}
