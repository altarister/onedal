package com.onedal.app.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import java.io.File

/**
 * 🔄 **배차망은 화면을 보는 그 자리에서 갈아탄다** (기사님 확정: *"4초 지워"*)
 *
 * 이 검사가 지키는 것은 **«기다리지 않는다»** 하나다. 기다림을 두면 그 기다림은 **다음 접근성 이벤트가 와야** 끝난다.
 * 픽커 홈처럼 가만히 있는 화면에서는 그 이벤트가 오지 않아 배차망이 안 바뀌고, 픽커 콜을 한 건도 못 읽는다
 * (서버도 계속 앞 배차망으로 안다). 시뮬레이터처럼 리스트를 10초마다 갱신하는 화면에서는 이벤트가 계속 와서
 * 이 버그가 가려진다 — 그래서 시뮬레이터에서 도는 것으로는 이 규칙이 확인되지 않는다.
 */
class NetworkSwitchGateTest {

    private val insung = "insung"
    private val picker = "kakaopicker"

    @Test
    fun `화면이 다른 배차망이면 그 자리에서 갈아탄다`() {
        assertEquals(picker, NetworkSwitchGate.switchTargetFor(picker, current = insung))
    }

    @Test
    fun `화면과 지금 판이 같으면 아무 일도 없다`() {
        assertNull(NetworkSwitchGate.switchTargetFor(insung, current = insung))
    }

    @Test
    fun `모르는 패키지는 관문의 일이 아니다`() {
        assertNull(NetworkSwitchGate.switchTargetFor(null, current = insung))
    }

    /**
     * 🔴 **회귀 방지** — «몇 초 지켜보기»가 다시 들어오면 여기서 걸린다.
     * 시각을 재는 순간 «다음 이벤트가 와야 끝나는 기다림»이 되살아나고,
     * 정지 화면에서 또 영영 안 갈아탄다.
     */
    @Test
    fun `관문은 시각도 타이머도 쓰지 않는다`() {
        val src = File("src/main/java/com/onedal/app/core/NetworkSwitchGate.kt").readText()
        val code = src.replace(Regex("/\\*[\\s\\S]*?\\*/"), "").replace(Regex("//.*"), "")
        listOf("elapsedRealtime", "currentTimeMillis", "postDelayed", "Handler", "since").forEach {
            assert(!code.contains(it)) { "관문이 «$it» 를 쓴다 — 기다림이 되살아났다" }
        }
    }
}
