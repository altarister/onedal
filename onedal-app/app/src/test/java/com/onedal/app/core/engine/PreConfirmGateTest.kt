package com.onedal.app.core.engine

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * 🧪 #82 — **3단계 검증을 다녀온 콜도 확정·취소를 누른다**
 *
 * 확정 전 화면 처리는 «보고했다» 표시(`isDetailScrapSent`)만 보고 건너뛰지 않는다 —
 * 3단계(동명이동 검증)에서 돌아와 마저 할 일(ACCEPT/CANCEL 클릭)이 예약돼 있으면 처리한다.
 * 표시만 보면 두 번째 진입이 돌려보내져 확정/취소 클릭 코드에 닿지 못하고,
 * 콜이 멈춘 채 서버가 강제 정리하게 된다.
 */
class PreConfirmGateTest {

    @Test
    fun `🔴 3단계 통과 후 복귀(ACCEPT 예약)는 건너뛰지 않는다 - 확정을 눌러야 한다`() {
        assertFalse(PreConfirmGate.shouldSkip(isDetailScrapSent = true, cautionAction = "ACCEPT"))
    }

    @Test
    fun `🔴 3단계 적발 후 복귀(CANCEL 예약)도 건너뛰지 않는다 - 취소를 눌러야 한다`() {
        assertFalse(PreConfirmGate.shouldSkip(isDetailScrapSent = true, cautionAction = "CANCEL"))
    }

    @Test
    fun `보고를 마쳤고 남은 일이 없으면 건너뛴다 - 중복 처리 방지 (원래 목적)`() {
        assertTrue(PreConfirmGate.shouldSkip(isDetailScrapSent = true, cautionAction = null))
    }

    @Test
    fun `아직 보고 전이면 처리한다`() {
        assertFalse(PreConfirmGate.shouldSkip(isDetailScrapSent = false, cautionAction = null))
    }

    @Test
    fun `팝업 검증 중(VERIFY)은 이 화면의 일이 아니다 - 건너뛴다`() {
        // VERIFY 는 팝업 화면(handleDropoffPopup)이 소비한다 — 상세 화면은 기다린다
        assertTrue(PreConfirmGate.shouldSkip(isDetailScrapSent = true, cautionAction = "VERIFY"))
    }
}
