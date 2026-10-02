package com.onedal.app.core

import com.onedal.app.core.engine.SessionManager
import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * 🌐🖱️ **배차망 매핑과 «잡은 방식» — 각각 한 곳에서만 파생한다** (기사님 확정)
 *
 * · TargetApp: 라벨→코드 매핑은 이 한 곳에만 둔다.
 *   배차망을 더할 때 여기 한 곳만 늘린다 — 값이 갈라지면 서버가 기본값으로 받는다.
 * · capturedVia: 6하원칙의 «어떻게»(자동·알람·직접) — **원장 기록 전용**이다.
 *   보호 분기는 여전히 clickOrigin(둘)이 만든 matchType 만 본다 (#75 재발 방지).
 */
class CapturedViaAndTargetAppTest {

    /**
     * ✍️ **픽커에서 앱이 «수락하기»를 누르는 길이 두 겹으로 막혀 있다** (기사님 확정 · 배차망_모드표.md).
     * ① 자동 모드가 없다(자동이 오면 알람으로) ② 수락 칸이 비어 있다(누를 계약 버튼 글자가 없다).
     * 픽커의 화면 판별 낱말(배차망 정의 표의 상세 글자)은 «수락하기»라, 수락 칸이 그것을 쓰면 곧 계약 버튼이 된다.
     */
    @Test
    fun `픽커는 자동 모드도 수락 칸도 없다 - 인성·화물24시는 둘 다 있다`() {
        val picker = com.onedal.app.plugins.DispatchPluginRegistry.get(TargetApp.KAKAOPICKER)
        assertEquals(null, picker.acceptButtons)
        assertEquals(false, "AUTO" in picker.availableModes)
        for (code in listOf(TargetApp.INSUNG, TargetApp.HWAMUL24)) {
            val p = com.onedal.app.plugins.DispatchPluginRegistry.get(code)
            assertEquals(true, !p.acceptButtons.isNullOrEmpty())
            assertEquals(true, "AUTO" in p.availableModes)
        }
    }

    /**
     * 🎛️ **픽커에는 자동 모드가 없다 — 자동이 오면 알람과 똑같이** (기사님 확정 · 배차망_모드표.md).
     * 이 줄이 «앱이 픽커 수락하기를 누르지 않는다»의 지킴이다: 픽커에서 실제 모드가 자동이 되면
     * 앱이 계약 버튼을 누르는 길(`contractedByApp`)이 열린다.
     */
    @Test
    fun `실제 모드 - 픽커 자동은 알람, 그 밖은 그대로, 모르는 값도 그대로`() {
        assertEquals("ALARM", TargetApp.effectiveMode("AUTO", TargetApp.KAKAOPICKER))
        assertEquals("SIMULATION", TargetApp.effectiveMode("SIMULATION", TargetApp.KAKAOPICKER))
        assertEquals("MANUAL", TargetApp.effectiveMode("MANUAL", TargetApp.KAKAOPICKER))
        assertEquals("AUTO", TargetApp.effectiveMode("AUTO", TargetApp.INSUNG))
        assertEquals("AUTO", TargetApp.effectiveMode("AUTO", TargetApp.HWAMUL24))
        // 모르는 값은 알람으로 바꾸지 않는다 — 모르면 잡지 않는다 (README 규칙 ④)
        assertEquals("", TargetApp.effectiveMode("", TargetApp.KAKAOPICKER))
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
        s.contractedByApp = true
        assertEquals("AUTO", s.capturedVia("AUTO"))
        assertEquals("AUTO", s.capturedVia("ALARM"))   // 알람 모드여도 누른 건 매크로다
    }

    @Test
    fun `알람 모드에서 기사님이 누르면 알람이다 - 일지가 알람의 성과를 세는 칸`() {
        val s = SessionManager()
        s.contractedByApp = false
        assertEquals("ALARM", s.capturedVia("ALARM"))
    }

    @Test
    fun `그 외 기사님 클릭은 직접이다`() {
        val s = SessionManager()
        s.contractedByApp = false
        assertEquals("MANUAL", s.capturedVia("MANUAL"))
        assertEquals("MANUAL", s.capturedVia("AUTO"))   // 자동 스위치인 채 손으로 눌러도 직접 (#75)
    }

    @Test
    fun `기록이 보호를 바꾸지 않는다 - 알람 클릭의 출신은 여전히 직접(MANUAL)이다`() {
        val s = SessionManager()
        s.contractedByApp = false
        // capturedVia 가 ALARM 이어도 서버 보호가 보는 출신은 MANUAL — #75 의 경계 그대로
        assertEquals("MANUAL", s.clickOrigin)
        assertEquals("ALARM", s.capturedVia("ALARM"))
    }
}

/**
 * 📝 **실제 픽커 앱인가 — 로그 조건 하나에만 쓴다** (기사님 확정 ㉯).
 * 배차망은 화면 글자로 정한다(`NetworkByScreenTest`). 앱 이름은 이 로그 조건에만 쓴다 —
 * 앱 이름으로 배차망을 정하면 시뮬레이터 앱 하나가 띄우는 세 배차망 화면을 가르지 못한다.
 */
class PickerAppLogConditionTest {
    @org.junit.Test
    fun `실제 픽커 앱 이름만 픽커 앱이다 - 시뮬레이터는 아니다`() {
        org.junit.Assert.assertTrue(TargetApp.isKakaoPickerApp("com.kakaomobility.flexer"))
        org.junit.Assert.assertFalse(TargetApp.isKakaoPickerApp("com.onedal.simulator"))
        org.junit.Assert.assertFalse(TargetApp.isKakaoPickerApp("com.kakao.talk"))
        org.junit.Assert.assertFalse(TargetApp.isKakaoPickerApp(null))
    }

    /**
     * 🚚 **시뮬레이터에서도 운행 단계를 찍는다 — 모르는 화면은 안 모은다** (기사님 지시).
     * 시뮬레이터 앱은 설정 화면·인성·화물24시도 띄운다 — 그 글자가 «모르는 픽커 화면»으로 로그를 덮으면 진짜 픽커 화면 기록이 묻힌다.
     */
    @org.junit.Test
    fun `로그 범위 - 실제 픽커는 둘 다 · 시뮬레이터 픽커 화면은 운행 단계만 · 그 밖은 없음`() {
        val sim = TargetApp.SIMULATOR_PACKAGE
        assertEquals(TargetApp.PickerLog.STAGE_AND_UNKNOWN, TargetApp.pickerLogScope("com.kakaomobility.flexer", TargetApp.KAKAOPICKER))
        assertEquals(TargetApp.PickerLog.STAGE_AND_UNKNOWN, TargetApp.pickerLogScope("com.kakaomobility.flexer", TargetApp.INSUNG))
        assertEquals(TargetApp.PickerLog.STAGE_ONLY, TargetApp.pickerLogScope(sim, TargetApp.KAKAOPICKER))
        assertEquals(TargetApp.PickerLog.NONE, TargetApp.pickerLogScope(sim, TargetApp.INSUNG))      // 시뮬레이터 인성 화면
        assertEquals(TargetApp.PickerLog.NONE, TargetApp.pickerLogScope(sim, TargetApp.HWAMUL24))
        assertEquals(TargetApp.PickerLog.NONE, TargetApp.pickerLogScope("com.android.systemui", TargetApp.KAKAOPICKER))   // 잠금화면
        assertEquals(TargetApp.PickerLog.NONE, TargetApp.pickerLogScope(null, TargetApp.KAKAOPICKER))
    }
}
