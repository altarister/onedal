package com.onedal.app.core

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * ⛔ **막힌 계정(승인 전 · 정지 · 탈퇴)이면 원달앱은 콜을 집지 않는다** (onedal-1f «가» · 기사님 «끝까지 1f 가»).
 * 서버가 보고만 거절하면 앱은 저장된 필터로 «서버 없이 혼자» 알람·상세 열기·누르기를 계속했다.
 * 판단은 «마지막 서버 답이 ACCOUNT_BLOCKED» 사실 하나 — 화면 읽기와 60초 보고는 계속해 풀리면 바로 돈다.
 * 진행 중인 콜의 결재 버튼은 막지 않는다(이미 잡은 콜은 끝까지).
 */
class AccountBlockedTest {
    @Test fun `계정 막힘이면 안 집고 · 토큰 풀림이나 정상이면 집는다`() {
        assertFalse(DeviceLink.picksCalls(DeviceLink.WHY_BLOCKED))
        assertTrue(DeviceLink.picksCalls(DeviceLink.WHY_UNLINKED))
        assertTrue(DeviceLink.picksCalls(null))
    }

    @Test fun `목록 처리는 막힘이면 판정을 안 하고 · 결재 버튼 길은 막힘을 안 본다`() {
        val src = File("src/main/java/com/onedal/app/HijackService.kt").readText()
        assertTrue(src.contains("val isTarget = !accountBlocked && scrapParser.shouldClick(order, tally)"))
        assertTrue(src.contains("⛔ [계정 막힘]"))
        val press = src.substringAfter("private fun pressDecisionButton(").substringBefore("\n    private fun ")
        assertFalse(press.contains("accountBlocked"))
    }
}
