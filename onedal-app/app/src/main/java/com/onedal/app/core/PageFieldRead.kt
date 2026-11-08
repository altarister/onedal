package com.onedal.app.core

import com.onedal.app.models.CallMoney
import com.onedal.app.models.MoneyLine
import com.onedal.app.models.SimplifiedOfficeOrder

/**
 * 📄 **화면 칸을 플러그인 정의대로 읽는다 — 공통 한 곳** (`PageFieldReadTest` · 기사님 «그건 플러그인에서 정의해야 하는 거야»).
 * 그 화면의 FieldSpec 가운데 칸이 맞고 «읽는다(READ)»이며 읽는 법(`read`)이 있는 것 하나로 읽는다. 배차망 이름을 모른다 — 다른 것은 정의의 인자뿐.
 * 노드 글은 한 칸 띄어 잇는다(서버에 보내는 원문 rawText 와 같은 꼴) — 노드가 갈려 온 «운송료» · «60,000» 도 한 줄에서 만난다.
 */
object PageFieldRead {
    /** 그 화면 · 그 칸(· 조각)의 값 글자 — 정의에 읽는 법이 없거나 화면에 없으면 null(지어내지 않는다) */
    fun fieldOf(pages: PageSpecs, page: Page, field: PageField, texts: List<String>, part: String = ""): String? {
        val spec = pages[page]?.firstOrNull { it.field == field && it.part == part && it.handling == Handling.READ && it.read != null } ?: return null
        return spec.read!!.find(texts.joinToString(" "))?.groupValues?.getOrNull(1)?.trim()?.takeIf { it.isNotEmpty() }
    }

    /** 요금 — 값 글자에서 쉼표를 떼어 정수로 · 0 이하는 없는 것 */
    fun fareOf(pages: PageSpecs, page: Page, texts: List<String>): Int? =
        fieldOf(pages, page, PageField.FARE, texts)?.replace(",", "")?.toIntOrNull()?.takeIf { it > 0 }

    /**
     * 화면에서 읽은 콜의 요금(· 돈 묶음 기사님 몫 줄)은 그 화면의 요금 칸 정의가 먼저 — 칸이 없거나 못 읽으면 읽은 값 그대로 (29 X12 · 세 배차망 같은 순서).
     * 목록 파서로 읽은 상세는 머리 «잔액» · 바닥 «산재보험료» 같은 «…원» 조각을 요금으로 집을 수 있다(화물24시).
     */
    fun fareFirst(order: SimplifiedOfficeOrder, pages: PageSpecs, page: Page, texts: List<String>): SimplifiedOfficeOrder =
        withPageFare(order, pages, page, texts) ?: order

    /** 💰 그 화면 요금 칸으로 요금과 돈 묶음 기사님 몫 줄을 같은 값으로 — 못 읽으면 null */
    private fun withPageFare(order: SimplifiedOfficeOrder, pages: PageSpecs, page: Page, texts: List<String>): SimplifiedOfficeOrder? {
        val won = fareOf(pages, page, texts) ?: return null
        return withIncome(order.copy(fare = won), won, fieldOf(pages, page, PageField.FARE, texts)!!)
    }

    /**
     * 💰 **그 화면의 돈 줄** — 요금 칸 가운데 조각 이름(part)이 돈 줄 갈래(`MoneyLine.KINDS`)인 «읽는다» 줄마다 한 줄 · 화면 글자 그대로.
     * 이름표 없는 요금 줄(part 빈 글자 — 인성 «요금 :» 꼴)은 기사님 몫 줄도 받을 돈 줄도 없을 때만 기사님 몫이다. 돈 줄이 하나도 없으면 null.
     */
    fun moneyOf(pages: PageSpecs, page: Page, texts: List<String>): CallMoney? {
        val joined = texts.joinToString(" ")
        val parts = pages[page].orEmpty()
            .filter { it.field == PageField.FARE && it.handling == Handling.READ && it.read != null && it.part in MoneyLine.KINDS }
            .mapNotNull { spec -> spec.read!!.find(joined)?.groupValues?.getOrNull(1)?.trim()?.let { shown -> shown.replace(",", "").toIntOrNull()?.let { MoneyLine(spec.part, it, shown) } } }
            .distinctBy { it.kind }
        val unnamed = if (parts.none { it.kind == MoneyLine.INCOME || it.kind == MoneyLine.COLLECT })
            fareOf(pages, page, texts)?.let { MoneyLine(MoneyLine.INCOME, it, fieldOf(pages, page, PageField.FARE, texts)!!) } else null
        val lines = listOfNotNull(unnamed) + parts
        return if (lines.isEmpty()) null else CallMoney(lines = lines)
    }

    /** 📏 정거장 거리 칸 — 값 글자를 km 숫자로 · 못 읽으면 null */
    fun kmOf(pages: PageSpecs, page: Page, field: PageField, texts: List<String>): Double? =
        fieldOf(pages, page, field, texts)?.toDoubleOrNull()

    /** 📏 그 화면의 상차 · 하차 거리 칸을 정거장이 비었을 때만 싣는다 — 목록 값 먼저 (`withStopKm`) */
    fun withDetailKm(order: SimplifiedOfficeOrder, pages: PageSpecs, page: Page, texts: List<String>): SimplifiedOfficeOrder =
        withStopKm(order, kmOf(pages, page, PageField.PICKUP_DISTANCE, texts), kmOf(pages, page, PageField.DELIVERY_DISTANCE, texts))

    /** 콜에 요금이 비었을 때만 그 화면의 정의로 채운다(돈 묶음 기사님 몫 줄도 같은 값) — 이미 있는 값(앱이 연 콜의 목록 값 · 돈 묶음)은 그대로 */
    fun withFare(order: SimplifiedOfficeOrder, pages: PageSpecs, page: Page, texts: List<String>): SimplifiedOfficeOrder =
        if (order.fare > 0) order else withPageFare(order, pages, page, texts) ?: order
}
