package com.onedal.app.core

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * 🧾 **값을 못 채운 콜은 버린다** (기사님 확정 · 배차망_모드표.md)
 *
 * · 목록: 줄을 다 읽지 못했으면(상차·하차·요금) 그 스캔에서 뺀다 — 지문도 뜨지 않는다.
 *   덜 읽힌 줄로 지문을 뜨면 다음 스캔에 주소가 읽혀 지문이 바뀌고, 같은 콜에 또 들어간다.
 * · 상세: 채운 뒤 요건을 한 번 본다. 못 채웠으면 서버에 보내지 않고 목록으로 — 목록 줄 값으로 대신 보내지 않는다.
 *   «막았다로 내리기»는 목록으로 돌아가기(처리 비우기) **앞**이다 — 비우면 누를 때 쥔 줄이 지워진다.
 */
class UnfilledCallDropTest {

    private fun codeOnly(path: String) = File(path).readText()
        .replace(Regex("/\\*[\\s\\S]*?\\*/"), "").replace(Regex("//.*"), "")

    private val list by lazy {
        codeOnly("src/main/java/com/onedal/app/HijackService.kt")
            .substringAfter("private fun handleListScreen").substringBefore("\n    private fun ")
    }
    private val seq by lazy { codeOnly("src/main/java/com/onedal/app/core/engine/PreConfirmSequence.kt") }

    @Test
    fun `목록 줄은 요건을 본 뒤에 지문을 뜬다`() {
        val check = list.indexOf("OrderRequirement.meets(")
        val print = list.indexOf("CallMemory.fingerprintOf(order)")
        assertTrue("목록 줄의 요건 확인이 없다", check > 0)
        assertTrue("지문을 요건 확인보다 먼저 뜬다", print > check)
    }

    @Test
    fun `상세는 요건을 보고, 못 채우면 목록 줄 값으로 대신 보내지 않는다`() {
        assertTrue("상세의 요건 확인이 없다", seq.contains("OrderRequirement.meets("))
        assertFalse("사진을 못 읽었는데 목록 줄 값으로 대신 보낸다", seq.contains("tappedCard ?: matchedListCard"))
    }

    @Test
    fun `버릴 때 막았다로 내리기가 목록으로 돌아가기보다 앞이다`() {
        val body = seq.substringAfter("fun ScanContext.dropUnfilledCall(").substringBefore("\n}")
        val demote = body.indexOf("demoteTappedCall(")
        val abort = body.indexOf("abortPreConfirm(")
        assertTrue("버리는 함수가 없거나 내리기가 없다", demote > 0)
        assertTrue("목록으로 돌아가기가 없다", abort > 0)
        assertTrue("처리를 비운 뒤에 내리면 누를 때 쥔 줄이 이미 지워졌다", demote < abort)
    }
}
