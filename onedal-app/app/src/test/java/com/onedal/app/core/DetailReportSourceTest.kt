package com.onedal.app.core

import com.google.gson.Gson
import com.onedal.app.models.DispatchBasicRequest
import com.onedal.app.models.SimplifiedOfficeOrder
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * 🏷️ **상세 보고도 실물/시뮬 한 칸을 싣는다** — 목록 보고(`ScrapPayload.source`)와 같은 값 (reviews/25 · 통계는 실물만 센다).
 * 없으면 픽커 상세 장부 줄의 출처가 비어 실물 거르기에서 빠진다.
 */
class DetailReportSourceTest {
    private val order = SimplifiedOfficeOrder(id = "c", pickup = "a", dropoff = "b", fare = 1, timestamp = "t")

    @Test fun `실물 픽커 화면의 상세 보고는 source real`() {
        val json = Gson().toJson(DispatchBasicRequest(deviceId = "d", order = order, capturedAt = "t",
            source = TargetApp.sourceOf("com.kakaomobility.flexer")))
        assertTrue(json, json.contains("\"source\":\"real\""))
    }

    @Test fun `서버 상세 받기가 같은 칸 이름을 읽는다`() {
        val src = File("../../onedal-web/server/src/routes/orders.ts").readText()
        assertTrue(src.contains("reportSourceOf(payload.source)") || src.contains("reportSourceOf((payload as any).source)"))
    }
}
