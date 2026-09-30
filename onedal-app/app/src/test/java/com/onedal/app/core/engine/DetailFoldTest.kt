package com.onedal.app.core.engine

import com.onedal.app.models.ScrapResponse
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * ⏩ **앱이 연 나쁜 콜은 판정 뒤 서버가 준 남은 초에 목록으로** (기사님 «가» · onedal-ab 안 · onedal-1f).
 * 서버가 목록 보고 응답 맨 위에 foldAfter{orderId, remainSec}를 싣는다(🔴·벨 미만 · 앱이 연 콜만 · 서버 시계로 잰 남은 초).
 * 앱은 10 을 들지 않는다. 없으면 지금처럼 pickerAlarmDetailSec(30초).
 */
class DetailFoldTest {
    private val now = 100_000L
    private val thirty = now + 25_000L   // 30초 타이머가 걸린 지 5초 — 25초 남음

    private fun fold(deadline: Long? = thirty, remain: Int = 10, same: Boolean = true, byApp: Boolean = true, detail: Boolean = true) =
        DetailFold.newDeadlineMs(deadline, now, remain * 1000L, sameOrder = same, openedByApp = byApp, onPreConfirmDetail = detail)

    @Test fun `앱이 연 같은 콜 - 받은 때 더하기 남은 초`() = assertEquals(now + 10_000L, fold())
    @Test fun `남은 초 0 이면 곧`() = assertEquals(now, fold(remain = 0))
    @Test fun `손으로 연 콜은 안 줄인다`() = assertNull(fold(byApp = false))
    @Test fun `다른 콜은 안 줄인다`() = assertNull(fold(same = false))
    @Test fun `확정 전 상세가 아니면 안 줄인다`() = assertNull(fold(detail = false))
    @Test fun `원래 마감이 더 이르면 그대로`() = assertNull(fold(deadline = now + 5_000L))
    @Test fun `걸린 타이머가 없으면 안 건다`() = assertNull(fold(deadline = null))

    @Test fun `목록 보고 응답 맨 위 foldAfter 를 읽는다`() {
        val r = com.google.gson.Gson().fromJson("""{"success":true,"foldAfter":{"orderId":"o1","remainSec":7}}""", ScrapResponse::class.java)
        assertEquals("o1", r.foldAfter?.orderId)
        assertEquals(7, r.foldAfter?.remainWholeSec())
    }

    @Test fun `confirm 에 openedByApp · 뒤로 가기 직전 같은 콜인지 다시 본다`() {
        val src = File("src/main/java/com/onedal/app/HijackService.kt").readText()
        assertTrue(src.contains("openedByApp = session.openedByApp,"))
        assertTrue(src.contains("detailFoldOrderId?.let { it != session.currentOrderId } == true"))
    }

    /** 📏 ab 실측 «막대 끝 → 접힘» 중앙 1.2초 — 뒤로 간 뒤 목록 확인까지 ms 를 남기고, 접기로 돌아간 것을 «무응답»이라 적지 않는다 */
    @Test fun `뒤로 간 뒤 목록 확인까지 ms · 접기 복귀 글`() {
        val src = File("src/main/java/com/onedal/app/HijackService.kt").readText()
        assertTrue(src.contains("↩️ [목록 확인] 뒤로 간 뒤"))
        assertTrue(src.contains("if (folded) \"서버 판정 뒤 접기\" else"))
    }

    /** 🔎 ab 부탁 — 서버는 판정 뒤 첫 응답부터 약 10초를 실었는데 앱은 «0초»로 처음 줄였다. 받은 때와 무시한 까닭을 남긴다 */
    @Test fun `무시하는 까닭을 말한다`() {
        assertEquals("상세 대기 타이머 없음", DetailFold.whyNot(null, now, 10_000L, true, true, true))
        assertEquals("다른 콜", DetailFold.whyNot(thirty, now, 10_000L, false, true, true))
        assertEquals("손 상세", DetailFold.whyNot(thirty, now, 10_000L, true, false, true))
        assertEquals("확정 전 상세 아님", DetailFold.whyNot(thirty, now, 10_000L, true, true, false))
        assertEquals("원래 마감이 더 이름", DetailFold.whyNot(now + 5_000L, now, 10_000L, true, true, true))
        assertNull(DetailFold.whyNot(thirty, now, 10_000L, true, true, true))
        assertTrue(File("src/main/java/com/onedal/app/HijackService.kt").readText().contains("⏩ [foldAfter 받음]"))
    }

    /**
     * 🔴 **서버는 남은 초를 0.1초 단위 소수로 보낸다**(scrap.ts · 9.7) — 정수 칸으로 받으면 목록 보고 응답 전체가 버려진다.
     * 라이브 10-01 00:49:53 «Expected an int but was 1.3 … path $.foldAfter.remainSec» — 빨리 접기 동안 결재·필터·심사 중 값을 모두 잃었다.
     */
    @Test fun `남은 초 소수도 읽는다 · 올림해 정수 초로`() {
        val r = com.google.gson.Gson().fromJson("""{"success":true,"foldAfter":{"orderId":"o1","remainSec":9.7}}""", ScrapResponse::class.java)
        assertEquals(9.7, r.foldAfter!!.remainSec, 0.0001)
        assertEquals(10, r.foldAfter!!.remainWholeSec())
        assertEquals(0, com.onedal.app.models.FoldAfter("o", 0.0).remainWholeSec())
    }

    /** ab 9e767a09 — foldAfter.remainMs(정수 ms)가 있으면 그것(올림 몫 최대 1초가 빠져 막대 끝과 접힘이 더 맞는다), 없으면 remainSec 올림 */
    @Test fun `남은 ms 가 있으면 그것 · 없으면 남은 초 올림`() {
        val g = com.google.gson.Gson()
        assertEquals(9_650L, g.fromJson("""{"foldAfter":{"orderId":"o","remainSec":10,"remainMs":9650}}""", ScrapResponse::class.java).foldAfter!!.remainMsOrSec())
        assertEquals(10_000L, g.fromJson("""{"foldAfter":{"orderId":"o","remainSec":9.7}}""", ScrapResponse::class.java).foldAfter!!.remainMsOrSec())
    }

    /** 🔴 응답 한 칸의 모양 때문에 결재를 잃지 않는다 — 서버가 칸을 빼거나 null 로 보내도 목록 보고 응답을 받는다(1f) */
    @Test fun `응답의 기기 제어·결재 칸은 없어도 받는다`() {
        val r = com.google.gson.Gson().fromJson("""{"success":true,"decision":{"orderId":"o1","action":null}}""", ScrapResponse::class.java)
        assertEquals(null, r.deviceControl)
        assertEquals(null, r.decision?.action)
        val model = File("src/main/java/com/onedal/app/models/SharedModels.kt").readText()
        assertTrue(model.contains("val deviceControl: DeviceControl? = null"))
        assertTrue(model.contains("val apiStatus: ApiStatus? = null"))
    }
}
