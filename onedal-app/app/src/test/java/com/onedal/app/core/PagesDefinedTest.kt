package com.onedal.app.core

import com.onedal.app.plugins.hwamul24.Hwamul24Pages
import com.onedal.app.plugins.insung.InsungPages
import com.onedal.app.plugins.kakaopicker.KakaoPickerPages
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * 📄 **세 배차망 모두 페이지 넷을 정의한다** (reviews/24 · 기사님 «정의되지 않았다고 버리는 것이 문제다»).
 * 칸이 비었거나 한 페이지에 같은 칸이 둘이면 표가 흐려진다 — 모름 칸 수는 부팅 줄(`PageSpecSummary`)로 본다.
 */
class PagesDefinedTest {
    private val all = mapOf("픽커" to KakaoPickerPages.pages, "인성" to InsungPages.pages, "24시" to Hwamul24Pages.pages)

    @Test fun `세 배차망 모두 페이지 넷이 있고 칸이 비지 않는다`() {
        for ((name, pages) in all) {
            assertEquals("$name 페이지", Page.values().toSet(), pages.keys)
            pages.forEach { (page, fields) -> assertTrue("$name $page 칸이 비었다", fields.isNotEmpty()) }
        }
    }

    @Test fun `한 페이지에 같은 칸 이름을 두 번 쓰지 않는다`() {
        for ((name, pages) in all) pages.forEach { (page, fields) ->
            val dup = fields.groupBy { it.field }.filterValues { it.size > 1 }.keys
            assertTrue("$name $page 겹친 칸: $dup", dup.isEmpty())
        }
    }

    @Test fun `읽는 칸은 읽는 곳을 적는다`() {
        for ((name, pages) in all) pages.forEach { (page, fields) ->
            fields.filter { it.handling == Handling.READ }.forEach { f ->
                assertTrue("$name $page ${f.field} 읽는 곳이 없다", f.usedAt.isNotBlank())
            }
        }
    }

    @Test fun `부팅 줄 모양`() {
        val line = PageSpecSummary.line("24시", Hwamul24Pages.pages)
        assertTrue(line, line.startsWith("24시 칸 ") && line.contains("모름 1"))
    }
}
