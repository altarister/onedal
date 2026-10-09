package com.onedal.app.core

import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * 📲 **그 배차망 앱을 앞으로 불러오는 길** (38 F36) — 시뮬레이터는 한 앱이 배차망을 «net» 신호로 바꾸고(다시 켜지 않음),
 * 실물은 그 패키지를 실행한다. 패키지를 모르면 못 돌아간다(그 뒤 «취소 못 누름»).
 * 못 잡는 것: startActivity 가 실제로 앞으로 오나 · 시뮬 껍데기 앱이 «net»을 읽나 — 폰.
 */
class NetworkFrontTest {
    @Test fun `🔴 시뮬 패키지면 시뮬 신호 · 그 밖 패키지면 실행 · 모르면 못 함`() {
        assertEquals(NetworkFront.How(NetworkFront.Kind.SIMULATOR, TargetApp.SIMULATOR_PACKAGE, "insung"), NetworkFront.of("insung", TargetApp.SIMULATOR_PACKAGE))
        assertEquals(NetworkFront.How(NetworkFront.Kind.LAUNCH, "kr.example.insung", "insung"), NetworkFront.of("insung", "kr.example.insung"))
        assertEquals(NetworkFront.How(NetworkFront.Kind.NONE, null, "insung"), NetworkFront.of("insung", null))
    }
}
