package com.onedal.app.core

import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * 👀 **스냅샷이 실패하면 «읽은 글자»를 함께 보낸다 — 개수만 세지 않는다**
 *
 * 실패 보고의 값어치는 «무엇을 읽었길래 실패했나»에 있다. 그런데 스냅샷이 뽑은 줄을 손에 쥐고도
 * `linesCount` 로 **개수만** 실어 보냈다. 저장 칸(`ocr_result`)도 통로도 이미 있는데 내용만 버렸다.
 *
 * 그래서 오늘 07:56 실패(이상 기록 #70)에서 **스냅샷이 무엇을 읽었는지 아무도 모른다.**
 * 남은 것은 접근성이 읽은 반쪽뿐이라, 배송지가 사진에 있었는지조차 확인할 수 없었다.
 *
 * 무엇을 막나
 * - **실패를 보고하면서 원본을 안 담는 것** — 다음에 같은 일이 나도 또 못 본다
 * - 글자가 없어 «화면에 없었나 · 파서가 못 읽었나»를 못 가르는 것 (원인이 아주 다르다)
 */
class SnapshotAnomalyLinesTest {

    private fun codeOnly(path: String) = File(path).readText()
        .replace(Regex("/\\*[\\s\\S]*?\\*/"), "").replace(Regex("//.*"), "")

    private val seq by lazy { codeOnly("src/main/java/com/onedal/app/core/engine/PreConfirmSequence.kt") }

    @Test
    fun `판독 실패 보고에 읽은 줄이 들어간다`() {
        val at = seq.indexOf("SNAPSHOT_PARSE_FAILED")
        assertTrue("판독 실패 보고 자리를 못 찾았다", at > 0)
        val body = seq.substring(at, minOf(at + 1200, seq.length))
        assertTrue(
            "`lines` 를 손에 쥐고도 개수만 보내면 왜 실패했는지 영영 못 본다",
            body.contains("\"lines\" to"),
        )
    }

    @Test
    fun `개수만 싣던 자리가 없다`() {
        assertTrue(
            "`linesCount` 만 보내면 «무엇을 읽었나»가 사라진다",
            !seq.contains(Regex("""ocrResult\s*=\s*mapOf\("linesCount""")),
        )
    }
}
