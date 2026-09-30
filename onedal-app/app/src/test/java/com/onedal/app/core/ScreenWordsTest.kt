package com.onedal.app.core

import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import java.io.File

/**
 * 📰 **칸에 안 들어간 글자를 버리지 않고 모은다 — 한 보고에 한 화면 몫** (reviews/24 · 기사님 «정의되지 않았다고 버리는 것이 문제다»).
 * 홍수는 가름으로 막는다 — 값은 이름표(«<시각>»), «키 : 값»은 키만, 지명은 «<지역>», 가게·건물 모양은 «<가게·건물>».
 */
class ScreenWordsTest {
    @After fun clear() { ScreenWords.onScreen(null); ScreenWords.drain() }

    private fun words() = ScreenWords.drain()?.words?.map { it.kind to it.word }

    @Test fun `값은 이름표로 · 못 알아본 값은 싣지 않는다(정의된 칸이다)`() {
        ScreenWords.onScreen(Page.LIST)
        ScreenWords.add("20km", WordKind.NOISE)
        ScreenWords.add("17.8", WordKind.UNKNOWN)
        assertEquals(listOf("noise" to "<거리>"), words())
    }

    @Test fun `키 값 줄은 키만`() {
        ScreenWords.onScreen(Page.DETAIL)
        ScreenWords.add("고객 : 홍길동", WordKind.UNKNOWN)
        assertEquals(listOf("unknown" to "고객"), words())
    }

    @Test fun `지명과 가게 이름은 모양으로 묶는다 - 잡음 낱말은 그대로`() {
        ScreenWords.onScreen(Page.LIST)
        ScreenWords.add("역삼2", WordKind.EXTRA)
        ScreenWords.add("[태전점]롯데리아", WordKind.UNKNOWN)
        ScreenWords.add("퀵 서포트 모드 1장 받기", WordKind.NOISE)
        assertEquals(listOf("extra" to "<지역>", "unknown" to "<가게·건물>", "noise" to "퀵 서포트 모드 1장 받기"), words())
    }

    @Test fun `같은 글자는 한 번 · 예시 줄은 200자까지`() {
        ScreenWords.onScreen(Page.LIST)
        repeat(3) { ScreenWords.add("당상", WordKind.NOISE, "x".repeat(300)) }
        val r = ScreenWords.drain()!!
        assertEquals("list", r.page)
        assertEquals(1, r.words.size)
        assertEquals(200, r.words[0].sample!!.length)
    }

    @Test fun `한 보고에 두 화면이 섞이면 먼저 것을 싣고 나머지는 다음 보고로 - 버리지 않는다`() {
        ScreenWords.onScreen(null)
        ScreenWords.add("당상", WordKind.NOISE)
        assertNull(ScreenWords.drain())
        ScreenWords.onScreen(Page.LIST)
        ScreenWords.add("당상", WordKind.NOISE)
        ScreenWords.onScreen(Page.DETAIL)
        ScreenWords.add("고객 : 가", WordKind.UNKNOWN)
        assertEquals(listOf("noise" to "당상"), words())
        val next = ScreenWords.drain()!!
        assertEquals("detail", next.page)
        assertEquals(listOf("unknown" to "고객"), next.words.map { it.kind to it.word })
        assertNull("비운 뒤에는 없다", ScreenWords.drain())
    }

    @Test fun `시각 콜론은 키 값이 아니다 · 만원은 금액`() {
        ScreenWords.onScreen(Page.DETAIL)
        ScreenWords.add("단기/장기 · 09:30~18:30", WordKind.UNKNOWN)
        ScreenWords.add("11만원", WordKind.NOISE)
        assertEquals(listOf("unknown" to "단기/장기 · 09:30~18:30", "noise" to "<금액>"), words())
    }

    @Test fun `가게 건물 모양은 서버 도구 isPlace 와 같은 규칙`() {
        val src = File("../../onedal-web/scripts/lib/wordKinds.mjs").readText()
        val js = Regex("""export const isPlace = \(w\) => /(.+)/\.test\(w\)""").find(src)!!.groupValues[1]
        assertEquals(js, ScreenWords.PLACE.pattern)
    }

    @Test fun `읽는 파서가 없는 화면은 화면 글자를 통째로 모은다 - 키만 · 값은 빼고`() {
        ScreenWords.onScreen(Page.CONFIRM, listOf("톤수", "1톤", "결제방법 : 카드", "60,000", "한차배송 신청내역 보기",
            "1시상차 6박스 카트가지고 고객님앞 갖다주세요"), "원문")
        assertEquals(listOf("unknown" to "톤수", "unknown" to "1톤", "unknown" to "결제방법",
            "unknown" to "한차배송 신청내역 보기", "unknown" to "<문장>"), words())
    }

    @Test fun `목록 페이지는 통째로 모으지 않는다 - 목록 글자는 파서만 까닭과 함께 넣는다`() {
        ScreenWords.onScreen(Page.LIST, listOf("퀵", "리스트 설정", "픽업지"), "원문")
        assertNull("화면이 바뀌어 보고가 나가도 목록 글자는 통째로 안 간다", ScreenWords.drain())
        ScreenWords.add("리스트 설정", WordKind.NOISE)
        assertEquals(listOf("noise" to "리스트 설정"), words())
    }

    @Test fun `화면 종류는 네 페이지 가운데 하나로 - 모르는 화면은 안 모은다`() {
        assertEquals(Page.LIST, pageOf(com.onedal.app.models.ScreenContext.LIST))
        assertEquals(Page.DETAIL, pageOf(com.onedal.app.models.ScreenContext.POPUP_MEMO))
        assertEquals(Page.CONFIRM, pageOf(com.onedal.app.models.ScreenContext.RUN_TO_PICKUP))
        assertEquals(Page.MY_ORDERS, pageOf(com.onedal.app.models.ScreenContext.MY_ORDERS))
        assertNull(pageOf(com.onedal.app.models.ScreenContext.HOME))
        assertNull(pageOf(com.onedal.app.models.ScreenContext.UNKNOWN))
    }
}
