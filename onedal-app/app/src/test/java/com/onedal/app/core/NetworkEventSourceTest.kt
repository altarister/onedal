package com.onedal.app.core

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * 📡 **배차망 알림으로 세는 앱** (onedal-ab 검토 · 1f «가»).
 * 조용한 다시 읽기(`ListWatch`)와 «목록이 움직이는 중»(`AlarmHold`)은 배차망 앱의 알림만 센다.
 * 내비·상태줄 알림까지 세면 운행 중 내비가 1초마다 알림을 내 «목록이 조용하다»가 영영 안 온다 — 조용한 다시 읽기가 멈춘다.
 */
class NetworkEventSourceTest {
    private val insung = "com.example.insung"

    @Test fun `실물 픽커`() = assertTrue(TargetApp.isNetworkPackage("com.kakaomobility.flexer", null))
    @Test fun `시뮬레이터`() = assertTrue(TargetApp.isNetworkPackage(TargetApp.SIMULATOR_PACKAGE, null))
    @Test fun `마지막으로 배차망 화면이던 앱(인성·화물24)`() = assertTrue(TargetApp.isNetworkPackage(insung, insung))
    @Test fun `상태줄`() = assertFalse(TargetApp.isNetworkPackage("com.android.systemui", insung))
    @Test fun `내비`() = assertFalse(TargetApp.isNetworkPackage("com.skt.tmap.ku", insung))
    @Test fun `앱 이름 모름`() = assertFalse(TargetApp.isNetworkPackage(null, null))
}
