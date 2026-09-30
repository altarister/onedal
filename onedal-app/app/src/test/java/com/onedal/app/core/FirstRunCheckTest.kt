package com.onedal.app.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * 🩺 **첫 실행 점검 화면** (운영센터 4단계 · reviews/29 · onedal-1f «가»).
 * 딸 폰에 개발자 없이 설치할 때 무엇이 빠졌는지 한 화면에 초록/빨강으로. 빨강이 있으면 앱을 켤 때 이 화면이 먼저 —
 * 단 고칠 수 없는 빨강(안드로이드 버전)과 «한동안 안 닿은 서버»는 켤 때마다 막지 않는다.
 */
class FirstRunCheckTest {
    private val now = 1_000_000_000L
    private val good = FirstRunCheck.Facts(
        live = true, serverUrl = "1dal.altari.com", lastReplyAtMs = now - 10_000, nowMs = now,
        hasToken = true, unlinkedWhy = null, accessibilityOn = true, batteryExempt = true, sdkInt = 34,
    )
    private fun row(f: FirstRunCheck.Facts, key: FirstRunCheck.Key) = FirstRunCheck.rows(f).first { it.key == key }

    @Test fun `모두 갖추면 다섯 줄 초록 · 점검 화면을 먼저 띄우지 않는다`() {
        val rows = FirstRunCheck.rows(good)
        assertEquals(5, rows.size)
        assertTrue(rows.all { it.ok })
        assertFalse(FirstRunCheck.mustShow(rows))
    }

    @Test fun `서버 - 한 번도 못 닿았으면 먼저 띄우고 · 닿은 적 있으면 빨강이어도 탭 안에서만`() {
        val never = good.copy(lastReplyAtMs = 0L)
        assertFalse(row(never, FirstRunCheck.Key.SERVER).ok)
        assertTrue(FirstRunCheck.mustShow(FirstRunCheck.rows(never)))
        val stale = good.copy(lastReplyAtMs = now - 3 * 60_000)
        assertFalse(row(stale, FirstRunCheck.Key.SERVER).ok)
        assertFalse(FirstRunCheck.mustShow(FirstRunCheck.rows(stale)))
        assertEquals(FirstRunCheck.Action.SETTINGS_TAB, row(stale, FirstRunCheck.Key.SERVER).action)
    }

    @Test fun `폰 연결 - 토큰이 없기만 하면 초록 · 서버가 거절했으면 빨강`() {
        assertTrue(row(good.copy(hasToken = false), FirstRunCheck.Key.LINK).ok)
        val cut = good.copy(unlinkedWhy = DeviceLink.WHY_UNLINKED)
        assertFalse(row(cut, FirstRunCheck.Key.LINK).ok)
        assertTrue(FirstRunCheck.mustShow(FirstRunCheck.rows(cut)))
    }

    @Test fun `접근성 - 꺼지면 빨강 · 13 이상은 제한된 설정 안내와 앱 정보 버튼`() {
        val off = row(good.copy(accessibilityOn = false), FirstRunCheck.Key.ACCESSIBILITY)
        assertFalse(off.ok)
        assertEquals(FirstRunCheck.Action.ACCESSIBILITY_SETTINGS, off.action)
        assertTrue(off.detail.contains("제한된 설정 허용"))
        assertEquals(FirstRunCheck.Action.APP_DETAILS, off.action2)
        val old = row(good.copy(accessibilityOn = false, sdkInt = 31), FirstRunCheck.Key.ACCESSIBILITY)
        assertFalse(old.detail.contains("제한된 설정"))
    }

    @Test fun `배터리 예외 없으면 빨강 · 요청 버튼`() {
        val r = row(good.copy(batteryExempt = false), FirstRunCheck.Key.BATTERY)
        assertFalse(r.ok)
        assertEquals(FirstRunCheck.Action.BATTERY_EXEMPT, r.action)
    }

    @Test fun `안드로이드 11 미만은 빨강이지만 켤 때 막지 않는다`() {
        val f = good.copy(sdkInt = 29)
        assertFalse(row(f, FirstRunCheck.Key.ANDROID).ok)
        assertFalse(FirstRunCheck.mustShow(FirstRunCheck.rows(f)))
    }

    @Test fun `켤 때 첫 탭은 mustShow · 배터리 창을 곧바로 띄우지 않는다`() {
        val main = File("src/main/java/com/onedal/app/MainActivity.kt").readText()
        assertTrue(main.contains("FirstRunCheck.mustShow("))
        assertFalse(main.contains("startActivity(intent)\n        }\n        // ----"))
        assertFalse(main.substringBefore("setContent").contains("ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS"))
    }
}
