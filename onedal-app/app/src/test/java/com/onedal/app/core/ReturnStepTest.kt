package com.onedal.app.core

import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * ↩️ **결재 · 시간 끝에 그 콜의 배차망 화면이 아니면 먼저 돌아간다** (38 F36 · 기사님 정답).
 * 다른 배차망 화면의 «취소»·«넘기기»를 누르지 않는다 — 5초 안에 못 돌아가면 누르지 않고 «취소 못 누름»(계약이 남음).
 * 못 잡는 것: 실제로 앞으로 불러오기(접근성 서비스의 배경 화면 열기) — 폰 day1 S16 첫 판.
 */
class ReturnStepTest {
    @Test fun `🔴 같은 배차망이면 누름 · 다르면 먼저 돌아감 · 5초 넘으면 포기 · 지킨 배차망을 모르면 지금처럼 누름`() {
        assertEquals(ReturnStep.Step.PRESS, ReturnStep.of("insung", "insung", 0))
        assertEquals(ReturnStep.Step.RETURN_FIRST, ReturnStep.of("kakaopicker", "insung", 0))
        assertEquals(ReturnStep.Step.RETURN_FIRST, ReturnStep.of(null, "insung", 4_999))
        assertEquals(ReturnStep.Step.GIVE_UP, ReturnStep.of("kakaopicker", "insung", 5_000))
        assertEquals(ReturnStep.Step.PRESS, ReturnStep.of("kakaopicker", null, 0))
    }
}
