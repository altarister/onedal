package com.onedal.app.core.engine

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * 🧬 **늦게 돌아온 사진 판독은 세대가 다르면 아무것도 안 남긴다** (픽커 상세가 10분 굳은 사고의 모양).
 * 목록으로 돌아와 세션을 비운 뒤 끝난 판독이 «손으로 연 콜 보류» 갈래로 새 세션에 isDetailScrapSent 를 박았고,
 * 다음 알람 상세가 그 표시 때문에 상세 처리 · 복귀 타이머를 둘 다 건너뛰어 굳었다.
 * 판독 흐름은 안드로이드 부품(Handler · 화면 읽기)에 묶여 단위 검사로 못 돌린다 — 순수 판단과 «세 갈래 맨 앞» 차례를 잠근다.
 * 못 잡는 것: 판독 콜백의 실제 실행 순서(세션 비우기와 판독 도착이 실제로 엇갈리는가) — 폰에서 «🧹 [늦은 판독 버림]» 줄로 본다.
 */
class SessionEpochTest {
    private fun codeOnly(path: String) = File(path).readText()
        .replace(Regex("/\\*[\\s\\S]*?\\*/"), "").replace(Regex("//.*"), "")

    private val snapshot by lazy {
        codeOnly("src/main/java/com/onedal/app/core/engine/PreConfirmSequence.kt")
            .substringAfter("private fun ScanContext.handlePreConfirmSnapshot(")
            .substringBefore("\nfun ")
    }
    private fun branch(from: String, to: String?) = snapshot.substringAfter(from).let { if (to != null) it.substringBefore(to) else it }

    @Test fun `세대가 같으면 지금 콜 · 다르면 늦게 온 것`() {
        assertFalse(SessionEpoch.stale(3, 3))
        assertTrue(SessionEpoch.stale(3, 4))
    }

    @Test fun `세션을 비울 때 세대가 오른다`() {
        val reset = codeOnly("src/main/java/com/onedal/app/core/engine/SessionManager.kt").substringAfter("fun reset(").substringBefore("\n    fun ")
        assertTrue("SessionManager.reset 이 epoch 를 올리지 않는다", reset.contains("epoch++"))
    }

    @Test fun `판독은 시작할 때 세대를 쥔다`() {
        val held = snapshot.indexOf("val startedEpoch = session.epoch")
        assertTrue("판독 시작 때 세대를 안 쥔다", held >= 0 && held < snapshot.indexOf("scheduleReadAndVerifyDetail("))
    }

    @Test fun `성공 갈래는 맨 앞에서 세대를 본다`() {
        val b = branch("onSuccess =", "onParseFailed =")
        val stale = b.indexOf("SessionEpoch.stale(")
        assertTrue("성공 갈래에 세대 확인이 없다", stale >= 0)
        for (after in listOf("isDetailScrapSent", "dropUnfilledCall(", "sendConfirmOnce(")) {
            val at = b.indexOf(after)
            if (at >= 0) assertTrue("성공 갈래가 세대보다 먼저 $after 를 건드린다", stale < at)
        }
    }

    @Test fun `판독 실패 갈래는 맨 앞에서 세대를 본다 · 늦은 판독은 이상 징후도 안 보낸다`() {
        val b = branch("onParseFailed =", "onError =")
        val stale = b.indexOf("SessionEpoch.stale(")
        assertTrue("판독 실패 갈래에 세대 확인이 없다", stale >= 0)
        assertTrue("판독 실패 갈래가 세대보다 먼저 이상 징후를 보낸다", stale < b.indexOf("sendAnomalyReport("))
        assertTrue("판독 실패 갈래가 세대보다 먼저 버린다", stale < b.indexOf("dropUnfilledCall("))
    }

    @Test fun `오류 갈래는 맨 앞에서 세대를 본다`() {
        val b = branch("onError =", null)
        val stale = b.indexOf("SessionEpoch.stale(")
        assertTrue("오류 갈래에 세대 확인이 없다", stale >= 0)
        assertTrue("오류 갈래가 세대보다 먼저 버린다", stale < b.indexOf("dropUnfilledCall("))
    }

    /** ⏱️ 상세 대기(#124 «누가 열었든 상세 대기 시간 뒤 리스트로»)는 «이미 처리함» 문보다 먼저 건다 — 표시가 남아도 굳지 않게 */
    @Test fun `상세 대기 타이머는 이미 처리함 문보다 앞이다`() {
        val screen = codeOnly("src/main/java/com/onedal/app/core/engine/PreConfirmSequence.kt")
            .substringAfter("fun ScanContext.handlePreConfirmScreen(").substringBefore("\nprivate fun ")
        val back = screen.indexOf("scheduleDetailBack()")
        val gate = screen.indexOf("PreConfirmGate.shouldSkip(")
        assertTrue("상세 대기 타이머가 «이미 처리함» 문 뒤에 있다 — 표시가 남으면 굳는다", back in 0 until gate)
    }
}
