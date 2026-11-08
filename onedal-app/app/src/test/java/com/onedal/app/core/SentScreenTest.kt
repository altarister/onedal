package com.onedal.app.core

import com.google.gson.JsonParser
import com.onedal.app.core.engine.ScreenDetector
import com.onedal.app.plugins.insung.InsungPlugin
import org.junit.Assert.assertEquals
import org.junit.Test
import java.io.File

/**
 * 📡 **이상 보고가 싣는 화면은 보내는 값** — 인성 적요 팝업을 모으는 중에 난 보고도 «확정 전 상세»로 간다.
 * 원달앱 안 값(`POPUP_MEMO`)을 실으면 서버 · 관제웹이 모르는 화면 값을 받는다.
 */
class SentScreenTest {
    @Test fun `적요 팝업 중 이상 보고의 화면은 확정 전 상세`() {
        val json = JsonParser.parseString(File("../../onedal-web/shared/src/network/screenCases.json").readText()).asJsonObject
        val popup = json["cases"].asJsonArray.map { it.asJsonObject }
            .first { it["network"].asString == "insung" && it["expect"].asString == "POPUP_MEMO" }["text"].asString
        val read = ScreenDetector().detect(popup, InsungPlugin().screens, lastPage = "확정 전 상세")
        assertEquals("POPUP_MEMO", read.context.name)
        // 서비스가 화면마다 적는 두 값(`updateScreenContext`) — 이상 보고는 보내는 값을 싣는다
        val reportedScreen = read.wire
        assertEquals("DETAIL_PRE_CONFIRM", TelemetryManager.sentScreenOf(reportedScreen))
    }
}
