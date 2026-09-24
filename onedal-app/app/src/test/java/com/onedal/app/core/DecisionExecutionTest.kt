package com.onedal.app.core

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * 🛡️ **판결 집행 — 세션은 버튼을 누른 뒤에 비운다** (18번 1.1.9 · 코드리뷰 Part 1 C-2).
 *
 * 서버 결재(KEEP/CANCEL)를 받으면 500ms 뒤에 «닫기/취소» 버튼을 누른다. 그런데 세션(`resetSessionState`)을
 * **누르기 전에 즉시** 비우면 ① 버튼을 못 찾아 비상 보고를 보낼 때 콜 id 가 이미 비어 `unknown` 으로 나가고
 * ② 그 500ms 동안 «잡는 중이 아님»이라 다음 스캔이 끼어들 수 있으며 ③ 서버는 버튼이 눌리기도 전에
 * «리스트로 돌아왔다»를 받는다. 비우는 자리는 콜백 안, 눌렀든 못 찾았든 **그 뒤** 하나여야 한다.
 *
 * 글자로 읽는 까닭: `HijackService` 는 접근성 서비스라 단위 검사에서 띄울 수 없다.
 */
class DecisionExecutionTest {

    private fun codeOnly(path: String) = File(path).readText()

    private fun executeBody(): String {
        val src = codeOnly("src/main/java/com/onedal/app/HijackService.kt")
        val start = src.indexOf("private fun executeDecisionImmediately(")
        assertTrue("executeDecisionImmediately 를 못 찾았다", start >= 0)
        val end = src.indexOf("private fun sendEmergencyReport(", start)
        assertTrue("sendEmergencyReport 를 못 찾았다", end > start)
        return src.substring(start, end)
    }

    @Test
    fun `🔴 500ms 콜백 밖에서 세션을 즉시 비우지 않는다`() {
        val body = executeBody()
        val afterDelay = body.substring(body.lastIndexOf("}, 500)"))
        assertFalse("콜백 밖(즉시)에서 resetSessionState() 를 부른다 — 버튼을 누르기 전에 세션이 비워진다",
            afterDelay.contains("resetSessionState()"))
    }

    @Test
    fun `🔴 세션 비우기는 버튼을 눌렀든 못 찾았든 그 뒤 - 비상 보고 뒤·recycle 앞`() {
        val body = executeBody()
        val callback = body.substring(body.indexOf("mainHandler.postDelayed({", body.indexOf("val targetBtnStr")))
        val report = callback.indexOf("sendEmergencyReport(")
        val recycle = callback.indexOf("rootNode.recycle()")
        val reset = callback.lastIndexOf("resetSessionState()")
        assertTrue("비상 보고 자리를 못 찾았다", report > 0)
        assertTrue("recycle 자리를 못 찾았다", recycle > report)
        assertTrue("resetSessionState() 가 비상 보고 뒤·recycle 앞에 있어야 한다 (report=$report reset=$reset recycle=$recycle)",
            reset in (report + 1) until recycle)
    }
}
