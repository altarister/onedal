package com.onedal.app.core

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * ✋ **기사님이 손으로 잡았다 — 수락 전 상세에서 «수락하면 배차망이 스스로 보내는 페이지»로 넘어감** (91판 S09 · 71 «가»).
 * 화물24시는 «배차신청»을 누르면 같은 화면 위에 «배차취소하기» 막대가 뜨는 «배차신청 뒤 화물상세정보»에 머문다(표의 landsAfterAccept).
 * 원달앱이 이것을 못 알아보면 손 신청 콜이 «안 잡은 미리보기»로 지워진다. 사실은 페이지 표 한 곳 — 배차망 이름으로 가르지 않는다.
 * 못 잡는 것: 직전 프레임 하나만 본다 — 두 화면 사이에 모르는 화면이 한 장 끼면 놓친다 · 실제 화면 순서 · 손 수락 보고가 화면 보고보다 먼저 가는 배선 — 폰(알람 화물24시 손 신청 → «✋ [손 수락]» → 서버 MANUAL 즉시 KEEP).
 */
class HandAcceptTest {
    private fun page(name: String, standard: StandardScreen?, landsAfterAccept: Boolean = false) =
        ScreenSpec(name, standard, emptyList(), standard == StandardScreen.MY_ORDERS, emptyList(), Seen.REAL, emptyList(), landsAfterAccept = landsAfterAccept)
    private val preConfirm = page("화물상세정보", StandardScreen.DETAIL_PRE_CONFIRM)
    private val myOrders = page("배차내역 목록", StandardScreen.MY_ORDERS, landsAfterAccept = true)
    private val list = page("화물정보", StandardScreen.LIST)

    @Test fun `🔴 미리보기 · 보고 보류 콜의 수락 전 상세 → 수락 뒤 페이지 = 손 수락`() {
        assertTrue(HandAccept.of(preConfirm, myOrders, wasPreview = true, heldUnfilled = false))
        assertTrue(HandAccept.of(preConfirm, myOrders, wasPreview = false, heldUnfilled = true))
    }

    @Test fun `돌아가기(콜 목록) · 앱이 계약한 콜 · 모르는 앞 페이지는 손 수락이 아니다`() {
        assertFalse(HandAccept.of(preConfirm, list, wasPreview = true, heldUnfilled = false))
        assertFalse(HandAccept.of(preConfirm, myOrders, wasPreview = false, heldUnfilled = false))
        assertFalse(HandAccept.of(null, myOrders, wasPreview = true, heldUnfilled = false))
        assertFalse(HandAccept.of(myOrders, myOrders, wasPreview = true, heldUnfilled = false))
    }

    @Test fun `🔴 화물24시 정의 표 - 화물상세정보 → 배차신청 뒤 화물상세정보 = 손 수락`() {
        val screens = com.onedal.app.plugins.hwamul24.Hwamul24Pages.screens
        fun named(n: String) = screens.first { it.name == n }
        assertTrue(HandAccept.of(named("화물상세정보"), named("배차신청 뒤 화물상세정보"), wasPreview = true, heldUnfilled = false))
    }
}
