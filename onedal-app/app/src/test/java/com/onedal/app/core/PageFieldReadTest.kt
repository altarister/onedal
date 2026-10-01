package com.onedal.app.core

import com.onedal.app.models.SimplifiedOfficeOrder
import com.onedal.app.plugins.hwamul24.Hwamul24Pages
import com.onedal.app.plugins.insung.InsungPages
import com.onedal.app.plugins.kakaopicker.KakaoPickerPages
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * 📄 **화면 칸은 플러그인 정의(FieldSpec.read)대로 읽는다** (기사님 «가» — «그건 플러그인에서 정의해야 하는 거야» · onedal-69).
 * 로컬 10-02 03:42 — 기사님이 손으로 연 인성 상세가 «요건 미달 — 요금 없음»으로 버려졌다. 목록 규칙(차종 다음 칸의 만 단위 숫자)을
 * 상세 글에 돌려 요금이 0 이 됐다. 상세 · 확정 화면의 요금은 그 화면의 정의로 읽는다 — 공통 길은 배차망 이름을 모른다.
 */
class PageFieldReadTest {
    /** 03:40:28 원달앱이 서버에 보낸 인성(시뮬) 상세 원문 — 노드를 한 줄로 이은 그대로 */
    private val insungDetail = listOf("고양퀵서비스-031-932-7722 전표 상태 : 신규 물품 : 박스 1개 차량 : 다마스 탁송료 : 수수료 : 23% 요금 : 50,000(카드) 구분 : 편도 형태 : 보통 적요상세 *카고 입니다. 세금계산서필 03:57 상차.")

    /** 🧾 공통 문제지 — 서버 jest 가 3단계에 같은 줄을 푼다(`onedal-web/shared/src/pageReadCases.json`) */
    private val cases = com.google.gson.JsonParser.parseString(File("../../onedal-web/shared/src/pageReadCases.json").readText())
        .asJsonObject["cases"].asJsonArray.map { it.asJsonObject }
    private val pagesOf = mapOf("insung" to InsungPages.pages, "hwamul24" to Hwamul24Pages.pages, "kakaopicker" to KakaoPickerPages.pages)

    @Test fun `공통 문제지 - 배차망별 화면 글에서 칸 값을 정의대로 읽는다`() {
        assertTrue("문제지가 비었다", cases.isNotEmpty())
        for (c in cases) {
            val page = Page.values().first { it.word == c["page"].asString }
            val field = PageField.values().first { it.word == c["field"].asString }
            val texts = c["texts"].asJsonArray.map { it.asString }
            val expect = c["expect"].takeIf { !it.isJsonNull }?.asString
            assertEquals("${c["network"].asString} ${c["page"].asString} ${c["field"].asString}${c["part"]?.asString?.let { ".$it" } ?: ""} — ${c["why"].asString}",
                expect, PageFieldRead.fieldOf(pagesOf.getValue(c["network"].asString), page, field, texts, c["part"]?.asString ?: ""))
            /* 💰 숫자로 바꾼 값 — 서버도 같은 칸을 같은 규칙(쉼표 떼고 정수 · 0 이하 못 읽음)으로 푼다 */
            if (c.has("fare")) assertEquals("${c["network"].asString} ${c["page"].asString} 요금 숫자 — ${c["why"].asString}",
                c["fare"].takeIf { !it.isJsonNull }?.asInt, PageFieldRead.fareOf(pagesOf.getValue(c["network"].asString), page, texts))
        }
    }

    @Test fun `요금은 쉼표를 떼어 정수 - 문제지 줄과 같은 화면`() {
        assertEquals(50000, PageFieldRead.fareOf(InsungPages.pages, Page.DETAIL, insungDetail))
        assertNull(PageFieldRead.fareOf(KakaoPickerPages.pages, Page.DETAIL, listOf("최종 수익 2,387")))
    }

    @Test fun `요금이 비었을 때만 채운다 - 앱이 연 콜의 목록 값은 그대로`() {
        val empty = SimplifiedOfficeOrder(id = "o", pickup = "배차값없음", dropoff = "배차값없음", fare = 0, timestamp = "t")
        assertEquals(50000, PageFieldRead.withFare(empty, InsungPages.pages, Page.DETAIL, insungDetail).fare)
        assertEquals(30000, PageFieldRead.withFare(empty.copy(fare = 30000), InsungPages.pages, Page.DETAIL, insungDetail).fare)
        assertEquals(0, PageFieldRead.withFare(empty, KakaoPickerPages.pages, Page.DETAIL, listOf("최종 수익 2,387")).fare)
    }

    @Test fun `공통 길은 배차망 이름으로 가르지 않는다`() {
        val names = Regex("""insung|hwamul24|kakaopicker|인성|24시|픽커""", RegexOption.IGNORE_CASE)
        val code = { p: String -> File("src/main/java/com/onedal/app/$p").readText()
            .replace(Regex("""/\*[\s\S]*?\*/"""), "").replace(Regex("""//.*"""), "") }
        assertTrue("PageFieldRead 에 배차망 이름", !names.containsMatchIn(code("core/PageFieldRead.kt")))
        val pre = code("core/engine/PreConfirmSequence.kt")
        assertTrue("PreConfirmSequence 가 정의로 요금을 채우지 않는다", pre.contains("PageFieldRead.withFare(") && pre.contains("plugin.pages"))
    }
}
