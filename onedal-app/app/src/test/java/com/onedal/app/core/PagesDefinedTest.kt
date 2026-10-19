package com.onedal.app.core

import com.onedal.app.plugins.hwamul24.Hwamul24Pages
import com.onedal.app.plugins.insung.InsungPages
import com.onedal.app.plugins.kakaopicker.KakaoPickerPages
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * 📄 **세 배차망 모두 칸을 적는 페이지를 다 정의한다** (기사님 «정의되지 않았다고 버리는 것이 문제다»).
 * 칸이 비었거나(그 배차망에 없는 페이지는 까닭과 함께 비운다) 한 페이지에 같은 칸이 둘이면 표가 흐려진다 — 모름 칸 수는 부팅 줄(`PageSpecSummary`)로 본다.
 */
class PagesDefinedTest {
    private val all = mapOf("픽커" to KakaoPickerPages.pages, "인성" to InsungPages.pages, "24시" to Hwamul24Pages.pages)

    /** 그 배차망에 없는 페이지(shared `absentPages` · 생성 파일로 옴) — 칸을 비우고 까닭을 적는다 */
    private val absent = mapOf("픽커" to KakaoPickerPages.absentPages, "인성" to InsungPages.absentPages, "24시" to Hwamul24Pages.absentPages)

    @Test fun `세 배차망 모두 칸을 적는 페이지가 다 있고 칸이 비지 않는다 — 없는 페이지만 비운다`() {
        for ((name, pages) in all) {
            assertEquals("$name 페이지", Page.values().toSet(), pages.keys)
            val none = absent.getValue(name)
            pages.forEach { (page, fields) ->
                if (page in none) assertTrue("$name $page 없는 페이지인데 칸이 있다", fields.isEmpty())
                else assertTrue("$name $page 칸이 비었다", fields.isNotEmpty())
            }
            none.forEach { (page, why) -> assertTrue("$name $page 없는 까닭이 비었다", why.isNotBlank()) }
        }
    }

    @Test fun `한 페이지에 같은 칸 · 조각을 두 번 쓰지 않는다`() {
        for ((name, pages) in all) pages.forEach { (page, fields) ->
            val dup = fields.groupBy { it.field to it.part }.filterValues { it.size > 1 }.keys   // 같은 칸이라도 조각(part)이 다르면 다른 줄
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
