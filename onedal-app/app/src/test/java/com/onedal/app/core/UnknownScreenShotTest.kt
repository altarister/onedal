package com.onedal.app.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * 📷 **못 알아본 화면 사진 — 찍는 때 · 상세 판독과 부딪히지 않기** (reviews/37 · 기사님 «가»)
 *
 * 1초 뒤에도 원달앱이 모르는 화면으로 보고 있고 · 상세 사진 판독 중이 아니고 · 마지막 사진에서 0.4초가 지났을 때만 찍는다.
 * 상세 판독은 방금 다른 사진을 찍었으면 남은 간격만큼(최대 0.34초) 미뤄 찍는다 — 평소엔 0초.
 */
class UnknownScreenShotTest {
    private val r = 30   // 안드로이드 11

    @Test fun `1초 뒤에도 모르는 화면 · 판독 없음 · 간격 지남 - 찍는다`() =
        assertNull(UnknownScreenShot.whyNot(stillUnknown = true, verifyingDetail = false, msSinceLastShot = 5_000, sdk = r))

    @Test fun `그사이 다른 화면으로 넘어갔으면 - 찍지 않는다(넘어가는 찰나)`() =
        assertEquals("다른 화면으로 넘어감", UnknownScreenShot.whyNot(false, false, 5_000, r))

    @Test fun `상세 사진 판독 중이면 - 찍지 않는다`() =
        assertEquals("상세 사진 판독 중", UnknownScreenShot.whyNot(true, true, 5_000, r))

    @Test fun `마지막 사진에서 0_4초 안이면 찍지 않고 0_4초가 지나면 찍는다`() {
        assertEquals("사진 간격 0.4초 안", UnknownScreenShot.whyNot(true, false, 390, r))
        assertNull(UnknownScreenShot.whyNot(true, false, 410, r))
    }

    @Test fun `안드로이드 11 미만 - 찍지 않는다`() =
        assertEquals("안드로이드 11 미만", UnknownScreenShot.whyNot(true, false, 5_000, 29))

    @Test fun `상세 판독 미루기 - 평소 0 · 방금 찍었으면 남은 간격만 · 최대 0_34초`() {
        assertEquals(0L, ShotGap.waitBeforeShotMs(sinceLastShotMs = 5_000))
        assertEquals(0L, ShotGap.waitBeforeShotMs(340))
        assertEquals(240L, ShotGap.waitBeforeShotMs(100))
        assertEquals(340L, ShotGap.waitBeforeShotMs(0))
        assertEquals(340L, ShotGap.waitBeforeShotMs(-50))   // 시계가 뒤로 가도 0.34초를 넘지 않는다
    }

    @Test fun `한 번도 안 찍었으면 간격은 충분하다`() {
        assertEquals(Long.MAX_VALUE, ShotGap.sinceLastShotMs(nowMs = 1_000, lastAtMs = 0))
        assertEquals(300L, ShotGap.sinceLastShotMs(nowMs = 1_300, lastAtMs = 1_000))
    }
}
