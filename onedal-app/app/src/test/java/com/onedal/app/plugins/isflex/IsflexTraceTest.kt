package com.onedal.app.plugins.isflex

import com.onedal.app.core.AppTrace
import com.onedal.app.core.TargetApp
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * 📱 **인성플렉스 운행 기록 — 실물 앱에서 홈 다음 목록이면 켠다** (실물 첫날 화면 글자 전문을 모으는 재료).
 * 원달앱은 화면을 읽을 때마다 등록된 모든 배차망의 칸을 부르므로, 인성플렉스 칸은 앱 이름이 인성플렉스일 때만 켠다 —
 * 실물 목록 앱이 둘(픽커 · 인성플렉스)이라 «실물인가»로만 가르면 실물 픽커 화면에서도 켜진다.
 * 못 잡는 것: 실물 앱에서 실제로 켜지나(접근성 알림 · 화면 판별 배선) — 실물 첫날 원달앱 로그 «▶️ [기록 시작] 홈에서 목록으로 들어왔다».
 */
class IsflexTraceTest {
    @Test fun `공통 판정 — 실물 · 홈 다음 목록일 때만`() {
        assertTrue(AppTrace.startsFromHome(live = true, previousWasHome = true, nowList = true))
        assertFalse(AppTrace.startsFromHome(live = false, previousWasHome = true, nowList = true))
        assertFalse(AppTrace.startsFromHome(live = true, previousWasHome = false, nowList = true))
        assertFalse(AppTrace.startsFromHome(live = true, previousWasHome = true, nowList = false))
    }

    @Test fun `실물 인성플렉스 앱에서 홈 다음 목록이면 켠다 · 홈이 아니었으면 안 켠다`() {
        assertTrue(IsflexPlugin.traceStarts(TargetApp.ISFLEX_PACKAGE, previousWasHome = true, nowList = true))
        assertFalse(IsflexPlugin.traceStarts(TargetApp.ISFLEX_PACKAGE, previousWasHome = false, nowList = true))
    }

    @Test fun `시뮬 앱은 안 켠다`() {
        assertEquals("sim", TargetApp.sourceOf(TargetApp.SIMULATOR_PACKAGE))
        assertFalse(IsflexPlugin.traceStarts(TargetApp.SIMULATOR_PACKAGE, previousWasHome = true, nowList = true))
    }

    @Test fun `🔴 실물 픽커 홈 → 목록이면 인성플렉스 쪽은 운행 기록을 안 켠다 · 화면도 안 읽는다`() {
        assertEquals("real", TargetApp.sourceOf(TargetApp.KAKAOPICKER_PACKAGE))
        assertFalse(IsflexPlugin.traceStarts(TargetApp.KAKAOPICKER_PACKAGE, previousWasHome = true, nowList = true))
        assertFalse(IsflexPlugin.readsScreen(TargetApp.KAKAOPICKER_PACKAGE, TargetApp.KAKAOPICKER))
        assertTrue(IsflexPlugin.readsScreen(TargetApp.ISFLEX_PACKAGE, TargetApp.INSUNG))
        assertTrue(IsflexPlugin.readsScreen(TargetApp.SIMULATOR_PACKAGE, TargetApp.ISFLEX))
    }
}
