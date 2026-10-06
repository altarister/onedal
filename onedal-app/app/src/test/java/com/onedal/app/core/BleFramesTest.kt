package com.onedal.app.core

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.ByteArrayOutputStream
import java.io.File
import java.nio.ByteBuffer
import java.util.zip.GZIPOutputStream

/**
 * 📶 **관제앱 공급을 블루투스로 받기** (reviews/50 ①-3) — 틀 읽기(`BleFrames`) · 도는 모드(`TargetApp.runningMode`) · 같은 결재 두 번.
 * 틀 값(UUID · 종류 바이트)이 shared 와 같은지는 서버 jest `bleProtocolPair` 가 이 소스를 읽어 문다.
 * 못 잡는 것: 실제 블루투스로 오가는지 · 관제앱이 끊긴 것을 5초 안에 아는지(폰 시험).
 */
class BleFramesTest {
    private fun frameSupply(json: String, chunk: Int): List<ByteArray> {
        val o = ByteArrayOutputStream()
        GZIPOutputStream(o).use { it.write(json.toByteArray()) }
        val gz = o.toByteArray()
        val framed = ByteBuffer.allocate(4 + gz.size).putInt(gz.size).put(gz).array()
        return (framed.indices step chunk).map { framed.copyOfRange(it, minOf(it + chunk, framed.size)) }
    }

    @Test fun `큰 칸 — 조각을 모아 길이만큼 차면 풀어 돌려준다 · 그 전엔 null`() {
        val json = """{"filter":{"isActive":true,"minFare":null,"k":"${(1..600).joinToString(",") { (it * 7919 % 10007).toString() }}"},"filterVersion":"v1"}"""
        val parts = frameSupply(json, 100)
        val a = BleFrames.BigAssembler()
        parts.dropLast(1).forEach { assertNull(a.add(it)) }
        assertEquals(json, a.add(parts.last()))
        // 다음 틀도 처음부터 받는다
        val again = frameSupply("""{"filterVersion":"v2"}""", 512)
        assertEquals("""{"filterVersion":"v2"}""", again.fold(null as String?) { _, p -> a.add(p) })
    }

    @Test fun `큰 칸 — 끊겨 reset 하면 반쯤 받은 틀을 버린다`() {
        val a = BleFrames.BigAssembler()
        val parts = frameSupply((1..800).joinToString(",") { (it * 7919 % 10007).toString() }, 64)   // 잘 안 줄어드는 글 — 조각이 여럿
        a.add(parts[0]); a.add(parts[1])
        a.reset()
        val fresh = frameSupply("""{"ok":1}""", 512)
        assertEquals("""{"ok":1}""", a.add(fresh[0]))
    }

    @Test fun `작은 칸 — 종류 · 본문 · 숨의 서버 살아 있음`() {
        val d = BleFrames.readSmall(BleFrames.small(BleFrames.DECISION, """{"orderId":"o1","action":"KEEP"}"""))!!
        assertEquals(BleFrames.DECISION, d.kind)
        assertEquals("""{"orderId":"o1","action":"KEEP"}""", d.body)
        assertEquals(true, BleFrames.readSmall(byteArrayOf(BleFrames.BREATH, 1))!!.serverAlive)
        assertEquals(false, BleFrames.readSmall(byteArrayOf(BleFrames.BREATH, 0))!!.serverAlive)
        assertNull(BleFrames.readSmall(ByteArray(0)))
    }

    /** 기준값은 node `createHmac('sha256', 서명).update(nonce)` 앞 32자 — 서버 · 관제앱(자바)과 같은 셈 */
    @Test fun `🔏 증명 셈 — HMAC-SHA256 16진 앞 32자 · 두 방향 머리말이 달라 HELLO 를 PROOF 로 못 쓴다`() {
        val sig = "0123456789abcdef0123456789abcdef"
        assertEquals("6f2662d51a1827e025ef8df87347b78f", BleFrames.helloMac(sig, "nonce-1"))
        assertEquals("e381a97932a0ca3b20bc3ee318d0bccc", BleFrames.proofMac(sig, "nonce-1"))
        assertEquals(32, BleFrames.nonce().length)
    }

    @Test fun `🔴 증명 전 기기의 쓰기는 버리고 공급 연결도 안 켠다 — 근처 기기가 «자동»이나 KEEP 을 넣지 못하게`() {
        val link = File("src/main/java/com/onedal/app/core/BleLink.kt").readText()
        val onWrite = link.substringAfter("private fun onWrite(p: Peer, u: UUID, v: ByteArray) {").substringBefore("private fun checkProof(")
        val gate = onWrite.indexOf("if (!p.proven || central !== p) {")
        assertTrue("증명 문", gate > 0)
        assertTrue("문이 공급 연결 켜기보다 앞", gate < onWrite.indexOf("setLinked(true)"))
        assertTrue("문이 리스너보다 앞", gate < onWrite.indexOf("listener.onPhone("))
        assertTrue("HELLO 에 서명을 싣지 않는다", !link.contains(".put(\"sig\""))
    }

    @Test fun `광고 표시 16진 → 바이트 · 깨지면 빈 배열`() {
        assertArrayEquals(byteArrayOf(0xbd.toByte(), 0x9f.toByte(), 0x27, 0xd8.toByte()), BleFrames.tagBytes("bd9f27d8"))
        assertEquals(0, BleFrames.tagBytes("abc").size)
        assertEquals(0, BleFrames.tagBytes("zz").size)
        assertEquals(0, BleFrames.tagBytes(null).size)
    }

    @Test fun `🔴 도는 모드 — 새 폰 직접 · 연결 · 서버 · 보고 중 하나라도 끊기면 자동만 알람 · 마지막 공급 모드는 남는다`() {
        assertEquals(TargetApp.MODE_BEFORE_REPLY, TargetApp.runningMode(null, true, true, true))
        assertEquals("AUTO", TargetApp.runningMode("AUTO", true, true, true))
        assertEquals("ALARM", TargetApp.runningMode("AUTO", false, true, true))
        assertEquals("ALARM", TargetApp.runningMode("AUTO", true, false, true))
        assertEquals("ALARM", TargetApp.runningMode("AUTO", true, true, false))
        assertEquals("ALARM", TargetApp.runningMode("ALARM", false, false, false))   // 관제앱 없이 PC 로만 — 알람은 계속(기사님 1 가)
        assertEquals("SIMULATION", TargetApp.runningMode("SIMULATION", false, true, true))
    }

    @Test fun `🔴 공급 연결이 끊기면 관제앱 서버 붙음도 거짓으로 — 다시 붙은 관제앱의 숨으로만 켠다`() {
        val tm = File("src/main/java/com/onedal/app/core/TelemetryManager.kt").readText()
        val onLinked = tm.substringAfter("fun onLinked(alive: Boolean) {").substringBefore("\n    }\n")
        assertTrue(onLinked.contains("if (!alive) serverAlive = false"))
        assertTrue(onLinked.indexOf("if (!alive) serverAlive = false") < onLinked.indexOf("recomputeMode("))
    }

    /** 실측 10-06 23:05:57 — 접근성 서비스가 다시 뜨자 저장된 «자동»을 두고 «직접»으로 시작했다(관제앱이 없으면 알람이 안 울린다) */
    @Test fun `🔴 서비스가 다시 뜨면 저장된 마지막 공급 모드로 곧바로 — 관제앱 전이니 자동이면 알람`() {
        val tm = File("src/main/java/com/onedal/app/core/TelemetryManager.kt").readText()
        val saved = tm.indexOf("private var suppliedMode: String? =")
        val init = tm.indexOf("init { currentMode = TargetApp.runningMode(suppliedMode, linked = false, serverAlive = false, replying = true) }")
        assertTrue("저장 값을 읽은 뒤에 정한다", saved in 0 until init)
        assertEquals("ALARM", TargetApp.runningMode("AUTO", linked = false, serverAlive = false, replying = true))
    }

    @Test fun `🔴 같은 콜의 결재가 다시 오면 실행은 안 하고 받았음만 — 실행했든 버렸든 받았음은 보낸다`() {
        val svc = File("src/main/java/com/onedal/app/HijackService.kt").readText()
        val block = svc.substringAfter("override fun onDecision(json: String) {").substringBefore("override fun onFold(")
        assertTrue(block.indexOf("orderId == lastExecutedDecisionOrderId ->") in 0 until block.indexOf("executeDecisionImmediately(action)"))
        assertTrue(block.contains("lastExecutedDecisionOrderId = orderId"))
        assertTrue(block.trimEnd().endsWith("}") && block.contains("bleLink?.ack(orderId)"))
    }

    @Test fun `🔴 보고 응답으로는 필터 · 모드 · 결재 · 빨리 접기 · 심사 중을 받지 않는다 — 한 값 한 길 · 칸 이름까지`() {
        val api = File("src/main/java/com/onedal/app/api/ApiClient.kt").readText()
        for (gone in listOf("dispatchEngineArgs", "pendingAckDecisionId", "scrapRes.decision", "scrapRes.foldAfter", "topOf", "onModeReceived"))
            assertTrue(gone, !api.contains(gone))
        val response = File("src/main/java/com/onedal/app/models/SharedModels.kt").readText().substringAfter("data class ScrapResponse(").substringBefore("\n)\n")
        for (gone in listOf("dispatchEngineArgs", "decision", "foldAfter", "filterVersion")) assertTrue("ScrapResponse.$gone", !response.contains(gone))
        val control = File("src/main/java/com/onedal/app/models/SharedModels.kt").readText().substringAfter("data class DeviceControl(").substringBefore("\n)\n")
        assertTrue("DeviceControl.mode", !control.contains("val mode"))
    }
}
