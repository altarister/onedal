package com.onedal.app.core

import com.onedal.app.core.engine.SessionManager
import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * 🌐🖱️ **배차망 매핑과 «잡은 방식» — 각각 한 곳에서만 파생한다** (기사님 확정 2026-08-30)
 *
 * · TargetApp: 라벨→코드 매핑이 네 곳에 흩어져 있던 것을 한 곳으로 (픽커_수집.md §6-전).
 *   배차망을 더할 때 여기 한 곳만 늘린다 — 값이 갈라지면 서버가 기본값으로 받는다.
 * · capturedVia: 6하원칙의 «어떻게»(자동·알람·직접) — **원장 기록 전용**이다.
 *   보호 분기는 여전히 clickOrigin(둘)이 만든 matchType 만 본다 (#75 재발 방지).
 */
class CapturedViaAndTargetAppTest {

    @Test
    fun `🚧 잡기 수순 능력 - 픽커는 어떤 모드여도 클릭하지 않는다 (수집·알람 전용)`() {
        // 인성 잡기 수순(상세→팝업3장→확정)이 픽커에서 돌면 엉뚱한 화면을 누른다 —
        // 픽커는 수락한 뒤에야 주소가 나오는 딴 수순이다 (픽커_수집.md §3-확장)
        assertEquals(false, TargetApp.supportsCatching(TargetApp.KAKAOPICKER))
        assertEquals(true, TargetApp.supportsCatching(TargetApp.INSUNG))
        assertEquals(true, TargetApp.supportsCatching(TargetApp.HWAMUL24))
    }

    @Test
    fun `라벨 매핑 - 인성콜·24시·픽커, 모르는 라벨은 인성`() {
        assertEquals("insung", TargetApp.codeOf("인성콜"))
        assertEquals("hwamul24", TargetApp.codeOf("24시"))
        assertEquals("kakaopicker", TargetApp.codeOf("픽커"))
        assertEquals("insung", TargetApp.codeOf(null))
        assertEquals("insung", TargetApp.codeOf("모르는앱"))
    }

    @Test
    fun `매크로가 눌렀으면 어떤 모드든 자동이다`() {
        val s = SessionManager()
        s.isAutoActive = true
        assertEquals("AUTO", s.capturedVia("AUTO"))
        assertEquals("AUTO", s.capturedVia("ALARM"))   // 알람 모드여도 누른 건 매크로다
    }

    @Test
    fun `알람 모드에서 기사님이 누르면 알람이다 - 일지가 알람의 성과를 세는 칸`() {
        val s = SessionManager()
        s.isAutoActive = false
        assertEquals("ALARM", s.capturedVia("ALARM"))
    }

    @Test
    fun `그 외 기사님 클릭은 직접이다`() {
        val s = SessionManager()
        s.isAutoActive = false
        assertEquals("MANUAL", s.capturedVia("MANUAL"))
        assertEquals("MANUAL", s.capturedVia("AUTO"))   // 자동 스위치인 채 손으로 눌러도 직접 (#75)
    }

    @Test
    fun `기록이 보호를 바꾸지 않는다 - 알람 클릭의 출신은 여전히 직접(MANUAL)이다`() {
        val s = SessionManager()
        s.isAutoActive = false
        // capturedVia 가 ALARM 이어도 서버 보호가 보는 출신은 MANUAL — #75 의 경계 그대로
        assertEquals("MANUAL", s.clickOrigin)
        assertEquals("ALARM", s.capturedVia("ALARM"))
    }
}
