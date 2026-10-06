package com.onedal.app.core

import com.google.gson.JsonObject
import com.google.gson.JsonParser
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * 🎛️ **네 모드 표 — 원달앱 쪽 짝** (reviews/44 · 원천은 `onedal-web/shared/src/modeTable.ts` 한 장 · 서버 쪽 짝은 shared `modeTable.test.ts`).
 * 상황마다 원달앱이 도는 모드 = `TargetApp.runningMode`(공급 받은 적 · 공급 연결 · 관제앱 서버 연결 · 보고 닿음)에 배차망 규칙(픽커는 자동 없음) — 표의 `running` 과 같다.
 * 도는 모드마다 하는 일(목록 누름 · 소리 · 확정 · 확정 막기 · 테두리)이 표의 `acts` 와 같다.
 * 못 잡는 것: 응답 실패가 실제로 언제 오는지(폰 · 서버 끄기 시험) · 상세 1~2초 사이에 응답이 실제로 오는지(폰 로그 «🔐 [확정 안 누름]»).
 */
class ModeTablePairTest {
    private val table: JsonObject by lazy {
        val ts = File("../../onedal-web/shared/src/modeTable.ts").readText()
        val body = Regex("""/\*JSON\*/([\s\S]*?)/\*JSON\*/""").find(ts)?.groupValues?.get(1)
            ?: error("modeTable.ts 에서 /*JSON*/ 표시 사이를 못 찾았다")
        JsonParser.parseString(body).asJsonObject
    }
    private val modes = listOf("AUTO", "ALARM", "MANUAL", "SIMULATION")
    private fun src(path: String) = File("src/main/java/com/onedal/app/$path").readText()

    @Test
    fun `🔴 상황마다 원달앱이 도는 모드가 표와 같다 — 새 폰 직접 · 끊기면 자동만 알람 · 픽커는 자동 없음`() {
        for (s in table["situations"].asJsonArray.map { it.asJsonObject }) {
            val id = s["id"].asString
            val network = s["network"].asString
            for (cmd in modes) {
                val supplied = if (!s["replied"].asBoolean) null
                    else s["phone"]?.takeIf { it.isJsonObject }?.asJsonObject?.get(cmd)?.asString ?: cmd
                val running = TargetApp.effectiveMode(
                    TargetApp.runningMode(supplied, s["linked"].asBoolean, s["serverAlive"].asBoolean, s["reachable"].asBoolean), network)
                assertEquals("$id · $cmd", s["running"].asJsonObject[cmd].asString, running)
            }
        }
    }

    @Test
    fun `도는 모드마다 하는 일 · 테두리 색이 표와 같다`() {
        val acts = table["acts"].asJsonObject
        for (m in modes) {
            val want = acts[m].asJsonObject
            val got = ModeActs.of(m)
            assertEquals("$m 목록 누름", want["tapsList"].asBoolean, got.tapsList)
            assertEquals("$m 소리", want["sound"].asBoolean, got.sound)
            assertEquals("$m 확정", want["contracts"].asBoolean, got.contracts)
            assertEquals("$m 확정 막기", want["blocksAccept"].asBoolean, got.blocksAccept)
            assertEquals("$m 테두리", want["frame"].asString.toLong(16).toInt(), ModeFrame.colorOf(m))
        }
    }

    @Test
    fun `배차망마다 «자동 확정 있음»이 플러그인의 쓸 수 있는 모드와 같다 — 서버가 «확정할 수 있는 폰»을 이 표로 센다`() {
        val nets = table["networks"].asJsonObject
        for (code in listOf("insung", "hwamul24", "kakaopicker")) {
            val want = "AUTO" in com.onedal.app.plugins.DispatchPluginRegistry.get(code).availableModes
            assertEquals(code, want, nets[code].asJsonObject["autoContract"].asBoolean)
        }
    }

    @Test
    fun `모르는 모드 값은 누르지도 울리지도 확정하지도 않는다(규칙 ④)`() {
        val unknown = ModeActs.of("UNKNOWN")
        assertFalse(unknown.tapsList || unknown.sound || unknown.contracts)
    }

    @Test
    fun `🔴 목록 누름 · 소리 · 확정 · 확정 막기는 ModeActs 한 곳을 본다 — 모드 이름을 따로 견주지 않는다`() {
        val hijack = src("HijackService.kt")
        assertTrue(hijack.contains("val tapsFromList = ModeActs.of(currentMode).tapsList"))
        assertTrue(hijack.contains("if (ModeActs.of(currentMode).sound) {"))
        assertFalse(hijack.contains("""currentMode == "AUTO" || currentMode == "SIMULATION""""))
        assertTrue(src("core/AutoTouchManager.kt").contains("ModeActs.of(currentMode ?: \"\").blocksAccept"))
        assertTrue(src("core/engine/PreConfirmSequence.kt").contains("ModeActs.of(mode).contracts && ReservationGate.isToday(order)"))
    }

    @Test
    fun `🔴 응답을 못 받으면 첫 실패에서 바로 — 재시도를 기다리지 않고 · 200 이 아닌 응답도`() {
        val api = src("api/ApiClient.kt")
        assertTrue("시도마다 실패 알림", api.contains("onAttemptFailed?.invoke()"))
        assertTrue("scrap 이 첫 실패 알림을 넘긴다", api.contains("onAttemptFailed = onNoResponse"))
        assertTrue("200 이 아닌 응답", api.contains("""AppLogger.w(TAG, "📡 [텔레메트리] 서버 에러 응답: ${'$'}code")
                    onNoResponse()"""))
        assertTrue(src("core/TelemetryManager.kt").contains("TargetApp.runningMode(suppliedMode, linked, serverAlive, !lostReply)"))
        assertTrue(src("core/TelemetryManager.kt").contains("var currentMode: String = TargetApp.MODE_BEFORE_REPLY"))
    }

    @Test
    fun `🔴 확정 직전에 지금 모드로 다시 묻는다 — 상세 사이에 알람으로 내려갔으면 확정 안 누름 · 미리보기로`() {
        val pre = src("core/engine/PreConfirmSequence.kt")
        val recheck = pre.indexOf("if (session.contractedByApp && !appContractsOnOpen(effectiveMode, order)) {")
        assertTrue("다시 묻는 자리", recheck >= 0)
        assertTrue("미리보기 표시보다 앞", recheck < pre.indexOf("if (!appContracts) session.isPreview = true"))
        assertTrue(pre.contains("🔐 [확정 안 누름] 지금 모드"))
    }
}
