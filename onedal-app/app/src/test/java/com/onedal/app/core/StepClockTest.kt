package com.onedal.app.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** ⏱️ 상세 뒤 단계 시간 · 상세 중 화면 읽기 요약 — 모양만 잠근다 (시각 줄이라 동작은 폰에서 잰다) */
class StepClockTest {
    @Test fun `단계마다 앞 단계 끝부터 잰다 - 처음은 대기`() {
        var t = 100L
        val c = StepClock(100L) { t }
        t = 150; c.mark("대기")
        t = 160; c.mark("대조")
        t = 1460; c.mark("필터")
        assertEquals("대기 50ms · 대조 10ms · 필터 1300ms · 합 1360ms", c.line())
    }

    @Test fun `화면 읽기는 1초마다 한 줄`() {
        val s = ScanTimer()
        assertNull(s.record(30, false, 0))
        assertNull(s.record(50, true, 500))
        assertEquals("1000ms 동안 3번(같은 글자 1) · 평균 40ms · 최대 50ms · 합 120ms", s.record(40, false, 1000))
        assertNull("비운 뒤 새 창", s.record(10, false, 1200))
    }

    /**
     * 👁️ **목록에서도 센다 — 알림·읽기·화면 못 얻음·스크롤 읽기** (실물 09-30 16:18:20~24 · 스크롤 뒤 4초 동안 로그 0줄이라 원인을 못 가렸다).
     * 아무 일 없는 1초는 줄이 없다(바뀔 때만). 상세에서 목록으로 돌아온 5초는 강제로 1초마다(0번이어도).
     */
    @Test fun `아무 일 없는 1초는 줄이 없다`() = assertNull(ScanTimer().tick(1000, force = false))

    @Test fun `화면 못 얻음과 스크롤 읽기와 알림 출처를 센다`() {
        val s = ScanTimer()
        assertNull(s.noRoot(0))
        s.scrollRead()
        assertNull(s.record(20, false, 300))
        assertNull(s.countEvent("flexer/스크롤", 400))
        val line = s.tick(1000, force = false)!!
        assertEquals("1000ms 동안 1번(같은 글자 0) · 평균 20ms · 최대 20ms · 합 20ms · 화면 못 얻음 1 · 스크롤 읽기 1 · 알림 flexer/스크롤 1", line)
    }

    @Test fun `읽기 없이 알림만 와도 1초가 지나면 줄이 나온다`() {
        val s = ScanTimer()
        assertNull(s.countEvent("flexer/내용", 0))
        assertEquals("1000ms 동안 0번(같은 글자 0) · 알림 flexer/내용 2", s.countEvent("flexer/내용", 1000))
    }

    @Test fun `강제면 아무 일 없어도 한 줄 - 목록 복귀 5초`() =
        assertEquals("1000ms 동안 0번(같은 글자 0)", ScanTimer().tick(5000, force = true))
}
