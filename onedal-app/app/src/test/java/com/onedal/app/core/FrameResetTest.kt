package com.onedal.app.core

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * 📐 **버린 틀 · 미룬 알람 뒤 다시 읽기는 같은 글자여도 목록을 다시 본다** (onedal-ab 검토 · 1f «가»).
 * 라이브 09-30 20:47:00 — 겹친 틀을 버린 뒤 다시 읽은 글자가 버린 틀과 같아 «같은 화면»으로 건너뛰었고, 목록이 33.1초 멈췄다.
 * 다시 읽기는 부르는 때에 목록·누르는 중 아님·상세 보내는 중 아님을 다시 본다 — 걸어 둔 사이 화면이 바뀐다.
 */
class FrameResetTest {
    private val src = File("src/main/java/com/onedal/app/HijackService.kt").readText()
        .replace(Regex("/\\*[\\s\\S]*?\\*/"), "").replace(Regex("//.*"), "")

    @Test fun `버린 틀 뒤 지문을 비운다`() =
        assertTrue(src.substringAfter("if (scrapParser.lastFrameDiscarded) {").substringBefore("} else discardStreak").contains("lastScreenFingerprint = 0"))

    @Test fun `알람을 미루면 지문을 비운다`() =
        assertTrue(src.substringAfter("AlarmHold.Kind.HOLD ->").substringBefore("AlarmHold.Kind.FIRE").contains("lastScreenFingerprint = 0"))

    @Test fun `걸어 둔 다시 읽기는 부르는 때에 목록·누름·상세 전송을 다시 본다`() {
        for (name in listOf("afterDiscardRead", "heldAlarmRecheck")) {
            val body = src.substringAfter("private val $name = Runnable {").substringBefore("}")
            assertTrue("$name: $body", body.contains("reservedRead("))
        }
        val guard = src.substringAfter("private fun reservedRead(").substringBefore("\n    }")
        listOf("ScreenContext.LIST", "tapPending", "isDetailScrapSent", "quietRead(").forEach { assertTrue(it, guard.contains(it)) }
    }

    @Test fun `목록을 떠나면 걸어 둔 다시 읽기 둘을 거둔다`() {
        val leave = src.substringAfter("if (!isListScreen && wasListScreen) {").substringBefore("\n        }")
        // 둘 다 목록 몫(WaitBook.LIST)으로 걸고 — 떠날 때 목록 몫을 한꺼번에 거둔다
        assertTrue(leave.contains("waitBook.cancelOwner(com.onedal.app.core.WaitBook.LIST)"))
        assertTrue(src.contains("waitBook.schedule(\"미룬 알람 다시 보기\", com.onedal.app.core.WaitBook.LIST"))
        assertTrue(src.contains("waitBook.schedule(\"겹친 틀 뒤 읽기\", com.onedal.app.core.WaitBook.LIST"))
    }

    @Test fun `알림 시각은 배차망 앱 것만 센다`() {
        val before = src.substringBefore("lastTargetEventMs = t").takeLast(200)
        assertTrue(before, before.contains("TargetApp.isNetworkPackage("))
        assertFalse("누름 기록이 같은 판별을 따로 적는다", src.contains("pkg == TargetApp.SIMULATOR_PACKAGE ||"))
    }
}
