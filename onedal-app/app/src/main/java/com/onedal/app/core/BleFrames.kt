package com.onedal.app.core

import java.io.ByteArrayOutputStream
import java.nio.ByteBuffer
import java.util.UUID
import java.util.zip.GZIPInputStream

/**
 * 📶 **관제앱 ↔ 원달앱 블루투스 틀 — 순수 함수** (reviews/50 ①-3 · 원천 shared `bleProtocol.ts` · 서버 jest `bleProtocolPair` 가 이 파일을 글자로 읽어 견준다).
 * 작은 칸: 한 번 쓰기에 `[종류 1][본문 JSON]`(PHONE · DECISION · BREATH · FOLD) · 큰 칸: SUPPLY 만 `[길이 4 · 큰 끝][gzip JSON]` 을 조각으로 · 알림 칸(원달앱 → 관제앱): `[종류 1][본문 JSON]`(HELLO · ACK).
 */
object BleFrames {
    val SERVICE: UUID = UUID.fromString("6f1d1000-1da1-4b1e-9e00-0000000000a1")
    val SMALL: UUID = UUID.fromString("6f1d1001-1da1-4b1e-9e00-0000000000a1")
    val BIG: UUID = UUID.fromString("6f1d1002-1da1-4b1e-9e00-0000000000a1")
    val NOTIFY: UUID = UUID.fromString("6f1d1003-1da1-4b1e-9e00-0000000000a1")
    val CCCD: UUID = UUID.fromString("00002902-0000-1000-8000-00805f9b34fb")

    const val HELLO: Byte = 1
    const val SUPPLY: Byte = 2
    const val PHONE: Byte = 3
    const val DECISION: Byte = 4
    const val ACK: Byte = 5
    const val BREATH: Byte = 6
    const val FOLD: Byte = 7
    const val CHALLENGE: Byte = 8
    const val PROOF: Byte = 9

    const val MAX_WRITE = 512
    const val SILENT_MS = 5000L

    /** 알림 칸 · 작은 칸 한 통 */
    fun small(kind: Byte, json: String): ByteArray = byteArrayOf(kind) + json.toByteArray(Charsets.UTF_8)

    /** 작은 칸 한 통 → 종류 · 본문(BREATH 는 본문 대신 «서버 살아 있음») · 비었으면 null */
    data class Small(val kind: Byte, val body: String, val serverAlive: Boolean?)
    fun readSmall(v: ByteArray): Small? {
        if (v.isEmpty()) return null
        if (v[0] == BREATH) return Small(BREATH, "", if (v.size > 1) v[1].toInt() == 1 else null)
        return Small(v[0], String(v, 1, v.size - 1, Charsets.UTF_8), null)
    }

    /** 🔏 주고받기 증명 — HMAC-SHA256(열쇠 = 짝 서명 글자, 글 = nonce) 16진 앞 32자 · 관제앱 `SupplyService.mac` 과 같은 셈 */
    fun mac(pairSig: String, nonce: String): String {
        val m = javax.crypto.Mac.getInstance("HmacSHA256")
        m.init(javax.crypto.spec.SecretKeySpec(pairSig.toByteArray(Charsets.UTF_8), "HmacSHA256"))
        return m.doFinal(nonce.toByteArray(Charsets.UTF_8)).joinToString("") { "%02x".format(it) }.take(32)
    }

    /** 아무 숫자 16바이트 16진 */
    fun nonce(): String = ByteArray(16).also { java.security.SecureRandom().nextBytes(it) }.joinToString("") { "%02x".format(it) }

    /** 광고 표시 16진 글자 → 바이트(홀수 · 깨진 글자는 빈 배열) */
    fun tagBytes(hex: String?): ByteArray {
        if (hex.isNullOrEmpty() || hex.length % 2 != 0) return ByteArray(0)
        return try { ByteArray(hex.length / 2) { hex.substring(it * 2, it * 2 + 2).toInt(16).toByte() } } catch (e: NumberFormatException) { ByteArray(0) }
    }

    /**
     * 📦 큰 칸 조립 — 첫 조각의 앞 4바이트가 gzip 길이 · 길이만큼 모이면 풀어 JSON 글자를 돌려준다.
     * 연결이 끊기면 [reset] — 반쯤 받은 틀을 다음 연결로 넘기지 않는다.
     */
    class BigAssembler {
        private var want = -1
        private val buf = ByteArrayOutputStream()
        fun reset() { want = -1; buf.reset() }
        /** 다 모였으면 풀린 JSON · 아직이면 null · 깨졌으면 버리고 null */
        fun add(chunk: ByteArray): String? {
            if (want < 0) {
                if (chunk.size < 4) return null
                want = ByteBuffer.wrap(chunk, 0, 4).int
                if (want <= 0) { reset(); return null }
                buf.write(chunk, 4, chunk.size - 4)
            } else buf.write(chunk)
            if (buf.size() < want) return null
            val gz = buf.toByteArray().copyOf(want)
            reset()
            return try { GZIPInputStream(gz.inputStream()).readBytes().toString(Charsets.UTF_8) } catch (e: Exception) { null }
        }
    }
}
