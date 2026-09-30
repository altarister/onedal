package com.onedal.app.core

import com.onedal.app.models.SimplifiedOfficeOrder
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * 🔍 **onedal-ab 교차 리뷰의 앱 몫** (1f «가» · 라이브 10-01).
 * A 걸어 둔 다시 읽기가 «같은 글자»로 돌아가 손 먼저 뒤 끝내 안 열었다 · B 넘긴 누르기가 오더카드·띠·탭 줄을 다시 안 봤다 ·
 * C 시스템이 무시한 목록 줄 누름을 검사 없이 곧바로 다시 눌렀다 · D 안 먹힌 누르기가 «열기 함»을 안 지워 영영 안 열었다 ·
 * E 줄을 못 찾으면 X 가 오른쪽 절반(오더카드 쪽)으로 떨어졌다 · F 기사님이 보고 계신 상세를 빨리 접기가 닫았다.
 */
class ReviewFixesTest {
    private val root = "src/main/java/com/onedal/app"
    private val svc by lazy { File("$root/HijackService.kt").readText() }

    @Test fun `D 열기 함을 지우면 다시 연다`() {
        val r = AlarmedRoutes()
        val c = SimplifiedOfficeOrder(id = "c", pickup = "분당 구미1", dropoff = "분당 구미", fare = 6622, timestamp = "t", pickupDistance = 3.0)
        r.markOpened(c, 0)
        assertTrue(r.opened(c))
        r.clearOpened(c)
        assertFalse(r.opened(c))
    }

    @Test fun `A 걸어 둔 다시 읽기는 화면 지문을 비우고 읽는다`() =
        assertTrue(svc.substringAfter("private fun reservedRead(").substringBefore("\n    }").contains("lastScreenFingerprint = 0"))

    @Test fun `B 넘겨받은 쪽이 planListTap 을 다시 거친다`() =
        assertTrue(svc.substringAfter("waitBook.schedule(\"누르기 넘김\"").substringBefore("performSimulatedTouch(").contains("plugin.planListTap(allNodes, order, fareNode)"))

    @Test fun `C 무시된 목록 줄 누름은 곧바로 다시 누르지 않는다`() {
        val touch = File("$root/core/AutoTouchManager.kt").readText()
        val cancelled = touch.substringAfter("override fun onCancelled(").substringBefore("override fun ")
        assertTrue(cancelled.contains("key.startsWith(\"call:\")"))
        assertTrue(cancelled.contains("무시된 누름"))
    }

    @Test fun `D 안 먹힌 누르기 되돌림이 열기 함도 지운다`() =
        assertTrue(svc.substringAfter("touchManager.onTapFailed = {").substringBefore("collectMachine =").contains("alarmedRoutes.clearOpened("))

    @Test fun `E 줄을 못 찾으면 누르지 않는다`() {
        val touch = File("$root/core/AutoTouchManager.kt").readText()
        val tapX = touch.substringAfter("private fun tapXOf(").substringBefore("\n    }")
        assertTrue(tapX.contains("return -1"))
        assertFalse("오른쪽으로 떨어뜨리지 않는다", tapX.contains("PICKER_LIST_LEFT_PX"))
    }

    @Test fun `F 상세에 손이 오면 빨리 접기를 푼다`() {
        assertTrue(svc.contains("⏩ [빨리 접기 풂] 상세에 손"))
        assertTrue(svc.substringAfter("private fun onFoldAfter(").substringBefore("\n    }").contains("foldReleasedOrderId"))
    }

    /**
     * 🔴 **안 먹힌 누르기는 «판정 안 함»으로 돌린다 — «막았다»로 내리지 않는다** (onedal-ab 리뷰 높음 1 · 11b57f8b 의 D 가 실제로는 안 고쳐졌다).
     * «막았다»는 필터 값이 바뀔 때만 풀려, 기사님 손가락 때문에 무시된 좋은 콜을 그때까지 건너뛰었다.
     * 같은 콜이 연속 두 번 안 먹히면 그때는 내린다 — 탭 막대처럼 늘 안 먹히는 자리에서 끝없이 되풀이하지 않게(라이브 09-30 8,393 ×6).
     */
    @Test fun `D2 안 먹힌 콜은 다음 읽기에서 다시 판정 - 연속 둘째면 내린다`() {
        val m = CallMemory()
        m.markEvaluated(7)
        assertTrue(m.alreadyEvaluated(7))
        m.forgetActed(7)
        assertFalse("다음 읽기에서 다시 판정", m.alreadyEvaluated(7))
        val failed = svc.substringAfter("touchManager.onTapFailed = {").substringBefore("collectMachine =")
        assertTrue(failed.contains("callMemory.forgetActed("))
        assertTrue("연속 둘째면 내린다", failed.contains("f.streak >= 2"))
    }
}
