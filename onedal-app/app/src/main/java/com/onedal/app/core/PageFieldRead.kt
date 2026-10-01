package com.onedal.app.core

import com.onedal.app.models.SimplifiedOfficeOrder

/**
 * 📄 **화면 칸을 플러그인 정의대로 읽는다 — 공통 한 곳** (`PageFieldReadTest` · 기사님 «그건 플러그인에서 정의해야 하는 거야»).
 * 그 화면의 FieldSpec 가운데 칸이 맞고 «읽는다(READ)»이며 읽는 법(`read`)이 있는 것 하나로 읽는다. 배차망 이름을 모른다 — 다른 것은 정의의 인자뿐.
 * 노드 글은 한 칸 띄어 잇는다(서버에 보내는 원문 rawText 와 같은 꼴) — 노드가 갈려 온 «운송료» · «60,000» 도 한 줄에서 만난다.
 */
object PageFieldRead {
    /** 그 화면 · 그 칸의 값 글자 — 정의에 읽는 법이 없거나 화면에 없으면 null(지어내지 않는다) */
    fun fieldOf(pages: PageSpecs, page: Page, field: PageField, texts: List<String>): String? {
        val spec = pages[page]?.firstOrNull { it.field == field && it.handling == Handling.READ && it.read != null } ?: return null
        return spec.read!!.find(texts.joinToString(" "))?.groupValues?.getOrNull(1)?.trim()?.takeIf { it.isNotEmpty() }
    }

    /** 요금 — 값 글자에서 쉼표를 떼어 정수로 · 0 이하는 없는 것 */
    fun fareOf(pages: PageSpecs, page: Page, texts: List<String>): Int? =
        fieldOf(pages, page, PageField.FARE, texts)?.replace(",", "")?.toIntOrNull()?.takeIf { it > 0 }

    /** 콜에 요금이 비었을 때만 그 화면의 정의로 채운다 — 이미 있는 값(앱이 연 콜의 목록 값)은 그대로 */
    fun withFare(order: SimplifiedOfficeOrder, pages: PageSpecs, page: Page, texts: List<String>): SimplifiedOfficeOrder =
        if (order.fare > 0) order else fareOf(pages, page, texts)?.let { order.copy(fare = it) } ?: order
}
