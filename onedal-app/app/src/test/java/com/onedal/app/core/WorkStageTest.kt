package com.onedal.app.core

import com.onedal.app.core.engine.SessionManager.CollectState
import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * 🚦 **앱이 지금 무슨 일을 하는 중인가 — 다섯 칸** (기사님 확정 2026-09-02 ·
 * `docs/기획/폰_상태바.md` 0단계 ①)
 *
 * 관제웹은 지금 `isHolding` **불리언 하나**만 받는다. «콜을 처리 중»까지만 알고
 * **어디서 멈췄는지**를 모른다 — 팝업 2장째에서 막힌 것과 판결을 기다리는 것이
 * 화면에서 똑같이 보인다.
 *
 * 🔴 **순서가 곧 규칙이다.** 좁은 것부터 본다 — 안전취소가 도는 동안은 판결도 기다리는
 *    중이지만, 기사님께 쓸모 있는 것은 **남은 초**다 (그 안에 무르지 않으면 계약이다).
 */
class WorkStageTest {

    @Test
    fun `아무 콜도 안 잡고 있으면 대기다`() {
        val w = WorkStage.of(false, false, null, CollectState.IDLE, false)
        assertEquals(WorkStage.IDLE, w.stage)
    }

    @Test
    fun `상세에 들어가 보고까지 했으면 상세다`() {
        val w = WorkStage.of(true, false, null, CollectState.IDLE, true)
        assertEquals(WorkStage.DETAIL, w.stage)
    }

    @Test
    fun `팝업은 몇 장째인지까지 말한다`() {
        assertEquals(1, WorkStage.of(true, false, null, CollectState.WAITING_FOR_PICKUP_POPUP, true).step)
        assertEquals(2, WorkStage.of(true, false, null, CollectState.WAITING_FOR_DROPOFF_POPUP, true).step)
        assertEquals(3, WorkStage.of(true, false, null, CollectState.WAITING_FOR_MEMO_POPUP, true).step)
        assertEquals(WorkStage.POPUP, WorkStage.of(true, false, null, CollectState.WAITING_FOR_PICKUP_POPUP, true).stage)
    }

    @Test
    fun `팝업을 다 걷었으면 판결 대기로 넘어간다`() {
        val w = WorkStage.of(true, true, null, CollectState.DONE, true)
        assertEquals(WorkStage.AWAITING_VERDICT, w.stage)
    }

    /** 🔴 안전취소가 도는 동안은 판결도 기다리는 중이다 — 그때 쓸모 있는 것은 **남은 초**다 */
    @Test
    fun `안전취소가 돌면 판결 대기보다 안전취소를 보여준다`() {
        val w = WorkStage.of(true, true, 12, CollectState.DONE, true)
        assertEquals(WorkStage.SAFE_CANCEL, w.stage)
        assertEquals(12, w.seconds)
    }

    @Test
    fun `팝업을 걷는 중이어도 안전취소가 돌면 안전취소가 이긴다`() {
        val w = WorkStage.of(true, true, 3, CollectState.WAITING_FOR_DROPOFF_POPUP, true)
        assertEquals(WorkStage.SAFE_CANCEL, w.stage)
    }

    /** ⚠️ 숫자는 **그 칸이 쓰는 것만** 담는다 — 한 값이 두 질문을 답하지 않게 (규칙 ⑤-4 ⑤) */
    @Test
    fun `대기 칸에는 숫자가 없다`() {
        val w = WorkStage.of(false, false, null, CollectState.IDLE, false)
        assertEquals(null, w.step)
        assertEquals(null, w.seconds)
    }
}
