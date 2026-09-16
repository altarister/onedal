package com.onedal.app.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * 👁️ **찍은 자리에 자국을 남긴다** (기사님 지시).
 *
 * 앱이 대신 눌러 주면 기사님은 **어디에 무엇이 눌렸는지**를 볼 방법이 없다 —
 * 화면은 이미 다음 장으로 넘어가 있고, 로그는 나중에나 본다.
 * 그래서 찍은 좌표에 반투명 회색 원과 그 카드 글자 한 줄을 잠깐 띄운다.
 *
 * 🔴 **자국은 터치를 먹지 않고 금방 걷힌다** — 남의 화면 위에 떠돌면 안 된다
 *    (`AlarmSignaler` 테두리와 같은 규칙: 접근성 오버레이 · `FLAG_NOT_TOUCHABLE`).
 * 여기서는 **창 자리와 이름표 글자**만 검사한다 (창 띄우기는 폰이 있어야 한다).
 */
class TapMarkerTest {

    @Test
    fun `창 위쪽은 찍은 자리에서 반지름만큼 위다`() {
        assertEquals(700, TapMarker.windowTopOf(centerY = 760, radiusPx = 60))
    }

    @Test
    fun `🔴 화면 위로는 안 나간다 - 창 위쪽은 0 아래로 안 내려간다`() {
        assertEquals(0, TapMarker.windowTopOf(centerY = 20, radiusPx = 60))
        assertTrue(TapMarker.windowTopOf(centerY = 0, radiusPx = 60) >= 0)
    }

    @Test
    fun `이름표는 «클릭» 뒤에 그 카드 글자를 붙인다`() {
        assertEquals("클릭 · 13,660원 서현→신촌", TapMarker.labelOf("13,660원 서현→신촌"))
    }

    @Test
    fun `카드 글자가 없으면 «클릭» 만 쓴다`() {
        assertEquals("클릭", TapMarker.labelOf(null))
        assertEquals("클릭", TapMarker.labelOf("   "))
    }

    @Test
    fun `줄바꿈은 한 줄로 눕힌다 - 자국은 한 줄짜리다`() {
        assertEquals("클릭 · 13,660원 서현 신촌", TapMarker.labelOf("13,660원 서현\n  신촌"))
    }

    @Test
    fun `이름표가 길면 잘라 한 줄로 만든다`() {
        val long = "가".repeat(100)
        val label = TapMarker.labelOf(long)
        assertTrue("너무 길다: ${label.length}", label.length <= TapMarker.LABEL_MAX + 5)
        assertTrue("잘렸음을 보여야 한다", label.endsWith("…"))
    }

    /**
     * 🧹 **고정된 시간으로 지우지 않는다** (기사님 지시) — 지우기를 메인 줄 맨 뒤에 세워
     * 폰이 깨어나는 순간 지워지게 했다. 고정 시간이면 폰이 멈춘 사이 점이 먼저 사라지거나,
     * 반대로 상세 화면을 오래 가린다. 시간 상수가 되살아나면 그 병도 함께 돌아온다.
     */
    @Test
    fun `🔴 점을 지우는 고정 시간 상수를 두지 않는다`() {
        // ⚠️ `const val` 은 **바깥 클래스**의 필드로 만들어진다 — `Companion` 을 보면 늘 비어 통과한다(허수 검사)
        val names = TapMarker::class.java.declaredFields.map { it.name }
        assertTrue("HOLD_MS 같은 고정 시간이 되살아났다: $names", names.none { it.contains("HOLD") })
    }
}
