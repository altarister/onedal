package com.onedal.app.plugins.kakaopicker

import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * 👆 **내려간 목록에서도 콜 줄을 누른다 — 오더카드가 없다는 픽커의 말(«오더카드 대기 중» 띠)이 있을 때만** (기사님 «목록이 내려가 있어도 앱을 열 수 있어야» · onedal-1f «가»).
 * 머리줄(«리스트 설정»)로 오더카드를 가르던 것(#111 · 09-13 오더카드 요금을 눌러 계약)은 머리줄이 보일 때 그대로다.
 * 오늘 로그 LIST 틀 776 중 머리줄 없는 틀 228 — 그중 226 에 «오더카드 대기 중» 띠 · «수락» 0.
 * 띠 좌표는 로그에 없어 실물 13-2 비율로 어림했다(띠 아래끝 ≈280 · 탭 줄 위끝 ≈2090 · 1080×2340).
 * 누르는 자리는 줄 왼쪽 끝 그대로(`TapShift.rowLeftOf` · 오더카드라면 «X» 닫기 쪽).
 */
class PickerScrolledTapTest {
    private fun n(t: String, top: Int, bottom: Int) = Triple(t, top, bottom)
    private val band = n("퀵 오더카드 대기 중.", 120, 280)
    private val tabs = listOf(n("신규", 2090, 2170), n("내 오더", 2090, 2170))
    // 라이브 09-30 20:38:29 — 18,130원 닻(965,1778) · 머리줄 없음
    private val rows = listOf(n("퀵", 1700, 1740), n("6.3km", 1760, 1800), n("마포", 1760, 1800), n("18,130", 1750, 1806))

    private fun block(nodes: List<Triple<String, Int, Int>>, fareY: Int = 1778) = KakaoPickerParser.scrolledRowTapBlock(nodes, fareY)

    @Test fun `20시38분29초 틀 - 대기 띠 아래 · 탭 줄 위 · 수락 없음이면 누른다`() = assertNull(block(listOf(band) + rows + tabs))

    @Test fun `띠 글이 대기 중이 아니면 안 누른다`() = assertNotNull(block(listOf(n("퀵 오더카드 1장 받기", 120, 280)) + rows + tabs))

    @Test fun `띠가 없으면 안 누른다`() = assertNotNull(block(rows + tabs))

    @Test fun `수락 노드가 보이면 안 누른다`() = assertNotNull(block(listOf(band, n("수락", 600, 680)) + rows + tabs))

    @Test fun `오더카드 버튼 꼴 숫자 P 가 보이면 안 누른다`() {
        assertNotNull(block(listOf(band, n("15,785 P", 560, 620)) + rows + tabs))
        assertNotNull(block(listOf(band, n("15,785P", 560, 620)) + rows + tabs))
    }

    @Test fun `띠 바로 밑 줄은 안 누른다`() = assertNotNull(block(listOf(band) + rows + tabs, fareY = 300))

    @Test fun `탭 줄에 걸린 줄은 안 누른다`() = assertNotNull(block(listOf(band) + rows + tabs, fareY = 2080))

    @Test fun `탭 줄을 못 찾으면 안 누른다`() = assertNotNull(block(listOf(band) + rows))

    @Test fun `머리줄이 없으면 새 길 · 누르기 직전 수락과 숫자 P 를 다시 찾는다 · 끄는 스위치 한 곳`() {
        val src = File("src/main/java/com/onedal/app/plugins/kakaopicker/KakaoPickerPlugin.kt").readText()
        assertTrue(src.contains("if (listHeaderY == null) return planScrolledTap("))
        assertTrue(src.contains("findAccessibilityNodeInfosByText(\"수락\")"))
        assertTrue(src.contains("KakaoPickerParser.isOfferPointButton("))
        assertTrue(src.contains("const val SCROLLED_LIST_TAP = true"))
    }
}
