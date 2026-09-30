package com.onedal.app.core

import com.onedal.app.models.SimplifiedOfficeOrder
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * 🔔 **같은 구 짝의 다른 콜을 «같은 경로»로 삼키지 않는다** (교차 리뷰 · onedal-1f «가»).
 * 실물 09-30 23:14 «송파→강남 · 요금 10318 → 9086» — 요금은 내려가지 않으니 다른 콜인데, 경로 기억이 같은 콜로 봐
 * 9,086 원 콜이 한 번도 안 셌다. 순서가 반대면 좋은 콜이 삼켜진다.
 * 흔들림 없는 읽기에서만 가른다 — 겹친 틀 · 흐르는 목록에서는 요금을 잘못 읽을 수 있어 옛 판단(같은 경로면 같은 콜) 그대로.
 */
class AlarmedRoutesSplitTest {
    private fun o(p: String, d: String, fare: Int) = SimplifiedOfficeOrder(id = "$p$d$fare", type = "LIST", pickup = p, dropoff = d, fare = fare, timestamp = "")

    @Test fun `요금이 내려가면 다른 콜 - 실물 송파→강남 10318 뒤 9086`() {
        val r = AlarmedRoutes()
        r.beginRead(steady = true); assertTrue(r.countIfNew(o("송파", "강남", 10318), 0))
        r.beginRead(steady = true); assertTrue("다른 콜로 센다", r.countIfNew(o("송파", "강남", 9086), 1000))
    }

    @Test fun `요금이 오르면 같은 콜 - 6700 뒤 6800`() {
        val r = AlarmedRoutes()
        r.beginRead(steady = true); assertTrue(r.countIfNew(o("분당 야탑1", "분당 야탑1", 6700), 0))
        r.beginRead(steady = true); assertFalse(r.countIfNew(o("분당 야탑1", "분당 야탑1", 6800), 1000))
    }

    @Test fun `한 읽기에 같은 경로 두 줄이면 둘 다 센다 · 같은 줄을 두 번 불러도 한 콜`() {
        val r = AlarmedRoutes()
        r.beginRead(steady = true)
        val a = o("수정", "수정", 8000); val b = o("수정", "수정", 9500)
        assertTrue(r.countIfNew(a, 0))
        assertTrue("같은 읽기의 둘째 줄은 다른 콜", r.countIfNew(b, 0))
        assertTrue("셈 뒤 소리 — 같은 줄", r.soundIfNew(b, 0))
        assertFalse("같은 줄 소리 두 번째", r.soundIfNew(b, 0))
    }

    @Test fun `흔들린 읽기에서는 옛 판단 - 같은 경로면 같은 콜`() {
        val r = AlarmedRoutes()
        r.beginRead(steady = true); assertTrue(r.countIfNew(o("송파", "강남", 10318), 0))
        r.beginRead(steady = false); assertFalse(r.countIfNew(o("송파", "강남", 9086), 1000))
    }

    @Test fun `목록 처리가 읽기마다 흔들림 사실을 넘긴다`() {
        val src = File("src/main/java/com/onedal/app/HijackService.kt").readText()
        assertTrue(src.contains("alarmedRoutes.beginRead(steady = !scrapParser.lastFrameDiscarded && !scanMoving)"))
    }
}
