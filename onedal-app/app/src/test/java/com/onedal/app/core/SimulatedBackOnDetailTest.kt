package com.onedal.app.core

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * 🐥🔙 **체험 결재 뒤 «뒤로»도 확정 전 상세일 때만** (reviews/46 · 기사님 «2 가»).
 *
 * 원달앱의 자동 «뒤로» 넷 중 셋(상세 대기 끝 · 결재 CANCEL · 값 못 채움)은 «지금 확정 전 상세인가»를 보고 누른다.
 * 체험 결재 뒤 «뒤로»만 화면을 안 보고 0.3초 뒤 무조건 눌렀다 — 결재가 늦어 이미 목록이면 그 «뒤로»가 목록에서 눌려
 * 시뮬레이터 홈으로 가고, 홈에서는 콜이 안 흘러 시험이 조용히 멈췄다.
 * 못 잡는 것: 실제 화면 순서(소스 글자로 자리만 본다 · 판결 콜백은 접근성 화면에 묶여 단위 검사로 못 돌린다).
 */
class SimulatedBackOnDetailTest {
    private val svc = File("src/main/java/com/onedal/app/HijackService.kt").readText()
    private val block: String by lazy {
        val start = svc.indexOf("\"체험 결재 뒤 뒤로\"")
        assertTrue("체험 결재 뒤 뒤로 자리가 있다", start > 0)
        svc.substring(start, svc.indexOf("return", start))
    }

    @Test fun `체험 결재 뒤 뒤로는 확정 전 상세일 때만 누른다`() {
        assertTrue(block.contains("ScreenContext.DETAIL_PRE_CONFIRM"))
    }

    @Test fun `체험 뒤로도 다른 뒤로와 같은 길 - touchManager performBack 으로 자국을 남긴다`() {
        assertTrue(block.contains("touchManager.performBack("))
        assertFalse("화면을 안 보는 맨 뒤로가 남지 않는다", block.contains("performGlobalAction(GLOBAL_ACTION_BACK)"))
    }
}
