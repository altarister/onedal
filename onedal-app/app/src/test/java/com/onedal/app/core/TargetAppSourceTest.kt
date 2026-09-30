package com.onedal.app.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * 🏷️ **보고가 실물 배차망 앱에서 왔나, 시뮬에서 왔나** (통계 계획 1단계 — 통계·뉴스레터는 실물만 센다).
 * 🔴 실물 앱 목록에 있을 때만 real — 시뮬 쪽 이름을 막는 식이면 크롬·다른 브라우저·새 시뮬 길이 «실물»로 샌다.
 */
class TargetAppSourceTest {
    @Test fun `실물 픽커 앱은 real`() = assertEquals("real", TargetApp.sourceOf("com.kakaomobility.flexer"))
    @Test fun `시뮬레이터 앱은 sim`() = assertEquals("sim", TargetApp.sourceOf(TargetApp.SIMULATOR_PACKAGE))
    @Test fun `크롬 웹 시뮬은 sim`() = assertEquals("sim", TargetApp.sourceOf("com.android.chrome"))
    @Test fun `처음 보는 앱도 sim`() = assertEquals("sim", TargetApp.sourceOf("com.sec.android.app.sbrowser"))
    @Test fun `앱 이름을 모르면 싣지 않는다`() = assertNull(TargetApp.sourceOf(null))
}
