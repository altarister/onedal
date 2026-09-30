package com.onedal.app.core.engine

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * 👆 **이 상세는 누가 열었나 — 앱이 판정만 할 상세에서는 기사님 손을 닫지 않는다** (기사님 «지금 내가 눌러서 열었는데 그냥 닫았어» · onedal-1f «가»).
 * 라이브 09-30 22:56:01 앱이 8,393(수정 시흥→서초3)을 눌렀으나 안 먹혔다(화면 그대로) — «앱이 연 콜» 기억이 5분 남았고,
 * 23:01:18 기사님이 손으로 연 백억커피 상세를 그 줄과 대조해 «누른 콜 아님 → 뒤로»로 닫았다(시간 창은 «손»이라고 맞게 봤다).
 * 가르는 사실은 배차망 이름이 아니라 «이 상세에서 앱이 계약 버튼을 누를 예정인가»(contractedByApp)다.
 */
class DetailOwnerTest {
    @Test fun `판정만 흐름 - 시간 창이 손이면 손 상세로 본다`() =
        assertTrue(DetailOwner.releaseToHand(openedByApp = true, contractedByApp = false, opener = "손"))

    @Test fun `판정만 흐름 - 시간 창이 알람이면 앱 상세 그대로`() =
        assertFalse(DetailOwner.releaseToHand(openedByApp = true, contractedByApp = false, opener = "알람"))

    @Test fun `계약 예정 흐름은 풀지 않는다`() =
        assertFalse(DetailOwner.releaseToHand(openedByApp = true, contractedByApp = true, opener = "손"))

    @Test fun `누른 콜 아님 - 계약 예정이면 계약 안 누르고 물러난다`() =
        assertEquals(DetailOwner.OnMismatch.RETREAT, DetailOwner.onMismatch(contractedByApp = true))

    @Test fun `누른 콜 아님 - 판정만 흐름이면 안 닫고 손 상세로`() =
        assertEquals(DetailOwner.OnMismatch.KEEP_AS_HAND, DetailOwner.onMismatch(contractedByApp = false))

    @Test fun `22시56분 누르기 안 먹힘 - 같은 콜 · 목록 그대로면 앱이 연 콜을 되돌린다`() {
        assertTrue(DetailOwner.releaseOnTapFailed(openedByApp = true, failedKey = "call:467902580", tappedKey = "call:467902580", onList = true))
        assertFalse("다른 콜", DetailOwner.releaseOnTapFailed(true, "call:1", "call:467902580", true))
        assertFalse("이미 상세", DetailOwner.releaseOnTapFailed(true, "call:467902580", "call:467902580", false))
    }

    @Test fun `세 자리가 DetailOwner 를 부른다 · 탭 줄 Y 기록`() {
        val seq = File("src/main/java/com/onedal/app/core/engine/PreConfirmSequence.kt").readText()
        assertTrue(seq.contains("DetailOwner.releaseToHand("))
        assertTrue(seq.contains("DetailOwner.onMismatch(session.contractedByApp)"))
        val svc = File("src/main/java/com/onedal/app/HijackService.kt").readText()
        assertTrue(svc.contains("DetailOwner.releaseOnTapFailed("))
        val plugin = File("src/main/java/com/onedal/app/plugins/kakaopicker/KakaoPickerPlugin.kt").readText()
        assertTrue(plugin.contains("📏 [아래 탭 줄]"))
    }
}
