package com.onedal.app.core

import com.onedal.app.core.engine.SafeCancelTimer
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * 📲 **원달앱이 확정한 콜은 원달앱이 끝까지 책임진다** (38 F36 · F42 · 기사님 정답).
 * 배차망 전환 · 수락 뒤 배차망이 보낸 페이지(화물24시 배차내역 목록)는 세션을 비워도 안전취소 타이머를 둔다 —
 * 콜 목록으로 돌아온 것은 그 콜을 놓은 것(4db86b2a)이라 끈다. 지키는 콜이 있나(armedOrderId)라는 사실로 가른다.
 * 못 잡는 것: HijackService 의 전환 · 목록 복귀 배선 — 폰 day1 S14 · S16.
 */
class SafeCancelKeepTest {
    private fun page(name: String, landsAfterAccept: Boolean = false) =
        ScreenSpec(name, StandardScreen.MY_ORDERS, emptyList(), true, emptyList(), Seen.REAL, emptyList(), landsAfterAccept = landsAfterAccept)
    private val screens = listOf(page("완료 탭"), page("배차내역 목록", landsAfterAccept = true))

    @Test fun `🔴 배차망 전환 — 지키는 계약이 있으면 둔다 · 없으면 지금처럼`() {
        assertTrue(SafeCancelKeep.onSwitch("call-A"))
        assertFalse(SafeCancelKeep.onSwitch(null))
    }

    @Test fun `🔴 목록 복귀 — 수락 뒤 배차망이 보낸 페이지면 둔다 · 콜 목록 · 인성 완료 탭은 놓음`() {
        assertTrue(SafeCancelKeep.onListReturn("call-A", SafeCancelKeep.landsAfterAccept(screens, "배차내역 목록")))
        assertFalse(SafeCancelKeep.onListReturn("call-A", SafeCancelKeep.landsAfterAccept(screens, "완료 탭")))
        assertFalse(SafeCancelKeep.onListReturn("call-A", SafeCancelKeep.landsAfterAccept(screens, null)))
        assertFalse(SafeCancelKeep.onListReturn(null, true))
    }

    @Test fun `🔴 지키는 계약은 배차망 · 패키지까지 적고 되읽는다 · 옛 값(콜 · 마감 두 칸)도 읽는다`() {
        val a = SafeCancelTimer.Armed("call-A", 123L, "insung", "com.onedal.simulator")
        assertEquals(a, SafeCancelTimer.Armed.decode(a.encode()))
        assertEquals(SafeCancelTimer.Armed("call-A", 123L, null, null), SafeCancelTimer.Armed.decode("call-A|123"))
        assertNull(SafeCancelTimer.Armed.decode("깨짐"))
        assertNull(SafeCancelTimer.Armed.decode(null))
    }
}
