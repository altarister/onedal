package com.onedal.app.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * ↩️ **결재가 온 뒤 돌아오기** (기사님 결정 · 배차망_모드표.md 순서 ⑩)
 *
 * 앱이 연 콜(알람·체험 등, 계약하지 않음): CANCEL 이면 바로 목록으로 돌아오고, KEEP 이면 돌아오는 타이머를 그대로 두어
 * 기사님이 판정을 보고 확정·수락할 시간을 남긴다. 기사님이 손으로 연 상세는 결재가 와도 앱이 뒤로 가지 않는다.
 * 결재가 오면 타이머를 무조건 끄면, 운전 중인 기사님 폰이 첫 좋은 콜 상세에 멈춰 목록을 못 본다.
 */
class DecisionReturnTest {

    private val body by lazy {
        File("src/main/java/com/onedal/app/HijackService.kt").readText()
            .replace(Regex("/\\*[\\s\\S]*?\\*/"), "").replace(Regex("//.*"), "")
            .substringAfter("private fun executeDecisionImmediately(").substringBefore("\n    private fun ")
    }

    @Test
    fun `결재가 오면 타이머를 끄는 것은 기사님이 연 상세뿐이다`() {
        assertEquals("타이머를 끄는 곳은 한 곳이어야 한다", 1, Regex("""cancelDetailBack\(\)""").findAll(body).count())
        assertTrue("기사님이 연 상세에서만 끄지 않는다",
            Regex("""if \(!session\.openedByApp\)\s*cancelDetailBack\(\)""").containsMatchIn(body))
    }

    @Test
    fun `앱이 연 콜의 CANCEL 은 바로 뒤로 간다 - 계약 콜 버튼 집행보다 앞에서`() {
        val beforeContract = body.substringBefore("if (!session.contractedByApp) return")
        assertTrue("CANCEL 갈래가 없다", beforeContract.contains("decision == \"CANCEL\""))
        assertTrue("앱이 연 콜만이어야 한다", beforeContract.contains("session.openedByApp"))
        assertTrue("뒤로 가기가 없다", beforeContract.contains("performBack("))
    }
}
