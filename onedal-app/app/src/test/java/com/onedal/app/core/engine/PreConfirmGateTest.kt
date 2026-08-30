package com.onedal.app.core.engine

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * 🧪 #82 — **3단계 검증을 다녀온 콜이 확정을 영영 못 누른다** (2026-08-30)
 *
 * 실측 (7지점 8판 16:54): 05의 동명이동 검증이 «통과»했는데도 확정 버튼이 안 눌렸다.
 * 확정 전 화면 처리의 첫 줄 `if (isDetailScrapSent) return` 이 3단계에서 돌아온
 * 두 번째 진입까지 돌려보냈기 때문이다 — 확정(ACCEPT)/취소(CANCEL) 클릭 코드가
 * 도달 불능이었다. 9초 멈춤 끝에 서버가 강제 정리했다.
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
