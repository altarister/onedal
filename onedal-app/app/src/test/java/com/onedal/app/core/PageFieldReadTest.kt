package com.onedal.app.core

import com.onedal.app.models.SimplifiedOfficeOrder
import com.onedal.app.plugins.hwamul24.Hwamul24Pages
import com.onedal.app.plugins.insung.InsungPages
import com.onedal.app.plugins.isflex.IsflexPages
import com.onedal.app.plugins.kakaopicker.KakaoPickerPages
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File
import com.onedal.app.models.CallStop

/**
 * 📄 **화면 칸은 플러그인 정의(FieldSpec.read)대로 읽는다** (기사님 «가» — «그건 플러그인에서 정의해야 하는 거야» · onedal-69).
 * 로컬 — 기사님이 손으로 연 인성 상세가 «요건 미달 — 요금 없음»으로 버려졌다. 목록 규칙(차종 다음 칸의 만 단위 숫자)을
 * 상세 글에 돌려 요금이 0 이 됐다. 상세 · 확정 화면의 요금은 그 화면의 정의로 읽는다 — 공통 길은 배차망 이름을 모른다.
 */
class PageFieldReadTest {
    /** 03:40:28 원달앱이 서버에 보낸 인성(시뮬) 상세 원문 — 노드를 한 줄로 이은 그대로 */
    private val insungDetail = listOf("고양퀵서비스-031-932-7722 전표 상태 : 신규 물품 : 박스 1개 차량 : 다마스 탁송료 : 수수료 : 23% 요금 : 50,000(카드) 구분 : 편도 형태 : 보통 적요상세 *카고 입니다. 세금계산서필 03:57 상차.")

    /** 🧾 공통 문제지 — 서버 jest 가 3단계에 같은 줄을 푼다(`onedal-web/shared/src/network/pageReadCases.json`) */
    private val cases = com.google.gson.JsonParser.parseString(File("../../onedal-web/shared/src/network/pageReadCases.json").readText())
        .asJsonObject["cases"].asJsonArray.map { it.asJsonObject }
    private val pagesOf = mapOf("insung" to InsungPages.pages, "hwamul24" to Hwamul24Pages.pages, "kakaopicker" to KakaoPickerPages.pages, "isflex" to IsflexPages.pages)

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

    /** 💰 문제지 돈 줄 문제(요금 칸 조각)의 갈래 이름이 원달앱 갈래에 다 있다 — shared `MONEY_KINDS` 와 같은 글자 */
    @Test fun `문제지 돈 줄 갈래는 원달앱 갈래에 다 있다`() {
        val parts = cases.filter { it["field"].asString == "fare" && it.has("part") }.map { it["part"].asString }.toSet()
        assertTrue("돈 줄 문제가 없다", parts.isNotEmpty())
        assertEquals(emptySet<String>(), parts - com.onedal.app.models.MoneyLine.KINDS.toSet())
    }

    /** 🔴 인성 착불 손 확정 — 확정 뒤 상세(영상 1743) · 보고 요금 칸은 지금처럼 «고객에게 받을 금액»(0장 F) */
    @Test fun `🔴 인성 확정 뒤 상세 돈 줄 - 기사님 몫은 실운임 · 받을 돈은 고객에게 받을 금액`() {
        val cod = listOf("고객에게 받을 금액 45,000", "실운임 : 34,650(착불)")
        val m = PageFieldRead.moneyOf(InsungPages.pages, Page.MY_CALL, cod)
        assertEquals(34650, incomeOf(m))
        assertEquals(45000, m?.lines?.firstOrNull { it.kind == com.onedal.app.models.MoneyLine.COLLECT }?.won)
        assertEquals("보고 요금 칸은 그대로", 45000, PageFieldRead.fareOf(InsungPages.pages, Page.MY_CALL, cod))
        val credit = PageFieldRead.moneyOf(InsungPages.pages, Page.MY_CALL, listOf("출발지", "도착지", "요금 : 40,000(신용)", "확정"))
        assertEquals("«요금 :» 만 있으면 기사님 몫", 40000, incomeOf(credit))
        assertEquals(listOf("income"), credit?.lines?.map { it.kind })
        assertNull("돈 줄이 없으면 null", PageFieldRead.moneyOf(InsungPages.pages, Page.MY_CALL, listOf("출발지", "도착지")))
    }

    @Test fun `손 확정 요금은 돈 묶음 기사님 몫 줄도 같은 값`() {
        val empty = SimplifiedOfficeOrder(id = "o", fare = 0, timestamp = "t", pickupDetails = listOf(CallStop(listText = "배차값없음")), dropoffDetails = listOf(CallStop(listText = "배차값없음")))
        val filled = PageFieldRead.withFare(empty, InsungPages.pages, Page.NEW_CALL, insungDetail)
        assertEquals(50000, incomeOf(filled.money))
        assertEquals("50,000", filled.money?.lines?.first()?.shown)
        val first = PageFieldRead.fareFirst(empty.copy(fare = 999), InsungPages.pages, Page.NEW_CALL, insungDetail)
        assertEquals(listOf(50000, 50000), listOf(first.fare, incomeOf(first.money)))
    }

    @Test fun `요금은 쉼표를 떼어 정수 - 문제지 줄과 같은 화면`() {
        assertEquals(50000, PageFieldRead.fareOf(InsungPages.pages, Page.NEW_CALL, insungDetail))
        assertNull(PageFieldRead.fareOf(KakaoPickerPages.pages, Page.NEW_CALL, listOf("최종 수익 2,387")))
    }

    @Test fun `요금이 비었을 때만 채운다 - 앱이 연 콜의 목록 값은 그대로`() {
        val empty = SimplifiedOfficeOrder(id = "o", fare = 0, timestamp = "t", pickupDetails = listOf(CallStop(listText = "배차값없음")), dropoffDetails = listOf(CallStop(listText = "배차값없음")))
        assertEquals(50000, PageFieldRead.withFare(empty, InsungPages.pages, Page.NEW_CALL, insungDetail).fare)
        assertEquals(30000, PageFieldRead.withFare(empty.copy(fare = 30000), InsungPages.pages, Page.NEW_CALL, insungDetail).fare)
        assertEquals(0, PageFieldRead.withFare(empty, KakaoPickerPages.pages, Page.NEW_CALL, listOf("최종 수익 2,387")).fare)
    }

    /** 📏 인성 확정 전 상세 적요 «현위치 → 상차지(직선)» · «상차지 → 하차지(직선)» — 정거장이 비었을 때만 싣는다(목록 «0.0» 은 빈 값이라 여기서 선다) */
    @Test fun `상세 거리 칸은 정거장이 비었을 때만 - 목록 값이 먼저`() {
        val detail = listOf("상태 : 배차", "현위치 → 상차지(직선)0.7KM", "상차지 → 하차지(직선)14.9KM", "확정(10)")
        val listed = SimplifiedOfficeOrder(id = "c", timestamp = "t", pickupDetails = listOf(CallStop(listText = "가산동", distanceKm = 1.2)), dropoffDetails = listOf(CallStop(listText = "논현동")))
        val filled = PageFieldRead.withDetailKm(listed, InsungPages.pages, Page.NEW_CALL, detail)
        assertEquals("목록 상차 거리 그대로", 1.2, firstStopKm(filled))
        assertEquals(14.9, deliveryKmOf(filled))
        assertEquals("거리 줄이 없으면 그대로", listed, PageFieldRead.withDetailKm(listed, InsungPages.pages, Page.NEW_CALL, insungDetail))
        assertEquals("확정 뒤 상세 하차 거리", 56.6, PageFieldRead.kmOf(InsungPages.pages, Page.MY_CALL, PageField.DELIVERY_DISTANCE, listOf("상태 : 배송", "현위치 → 상차지(직선)8.8KM", "상차지 → 하차지(직선)56.6KM")))
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
