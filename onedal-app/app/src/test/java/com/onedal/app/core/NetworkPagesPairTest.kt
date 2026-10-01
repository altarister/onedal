package com.onedal.app.core

import com.google.gson.JsonObject
import com.google.gson.JsonParser
import com.onedal.app.plugins.hwamul24.Hwamul24Pages
import com.onedal.app.plugins.insung.InsungPages
import com.onedal.app.plugins.kakaopicker.KakaoPickerPages
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * 🔗 **짝 — 원달앱 화면 정의 세 벌과 shared 배차망 정의 표가 같다** (reviews/34 2단계 · 기사님 «플러그인스에 있는 값을 서버가 같이 써야»).
 * 원천은 `onedal-web/shared/src/networkPages.ts` 한 장이고, 원달앱 `…Pages.kt` 셋은 `pnpm gen:pages` 가 뽑은 생성 파일이다.
 * 표를 고치고 안 뽑으면(또는 Pages.kt 를 손으로 고치면) 여기서 빨갛다 — 칸 · 자리 글 · 견본 · 본 곳 · 읽나 · 읽는 곳 · 읽는 법까지 견준다.
 */
class NetworkPagesPairTest {
    private val table: JsonObject by lazy {
        val ts = File("../../onedal-web/shared/src/networkPages.ts").readText()
        val body = Regex("""/\*JSON\*/([\s\S]*?)/\*JSON\*/""").find(ts)?.groupValues?.get(1)
            ?: error("networkPages.ts 에서 /*JSON*/ 표시 사이를 못 찾았다")
        JsonParser.parseString(body).asJsonObject
    }

    private fun rowsOf(pages: PageSpecs): List<List<String?>> =
        Page.values().filter { it in pages }.flatMap { page ->
            pages.getValue(page).map { f -> listOf(page.word, f.field.word, f.where, f.sample, f.seen.name, f.handling.name, f.usedAt, f.read?.pattern, f.part) }
        }

    private fun rowsOf(network: String): List<List<String?>> {
        val pages = table[network].asJsonObject["pages"].asJsonObject
        return pages.entrySet().flatMap { (page, rows) ->
            rows.asJsonArray.map { it.asJsonObject }.map { r ->
                fun s(k: String) = r[k]?.takeIf { !it.isJsonNull }?.asString
                listOf(page, s("field"), s("where"), s("sample"), s("seen"), s("handling"), s("usedAt") ?: "", s("read"), s("part") ?: "")
            }
        }
    }

    @Test fun `인성 화면 정의는 표와 같다`() = assertEquals(rowsOf("insung"), rowsOf(InsungPages.pages))
    @Test fun `화물24시 화면 정의는 표와 같다`() = assertEquals(rowsOf("hwamul24"), rowsOf(Hwamul24Pages.pages))
    @Test fun `카카오 픽커 화면 정의는 표와 같다`() = assertEquals(rowsOf("kakaopicker"), rowsOf(KakaoPickerPages.pages))

    @Test fun `세 Pages_kt 는 생성 파일이다 - 손으로 고치지 않는다`() {
        for (p in listOf("insung/InsungPages.kt", "hwamul24/Hwamul24Pages.kt", "kakaopicker/KakaoPickerPages.kt")) {
            assertTrue("$p 가 생성 파일 머리를 안 단다 — cd onedal-web && pnpm gen:pages",
                File("src/main/java/com/onedal/app/plugins/$p").readText().contains("생성 파일이다 — 손으로 고치지 않는다"))
        }
    }
}
