package com.onedal.app.core

import com.onedal.app.core.engine.AddressForm
import com.onedal.app.models.CALL_BILLING_TYPES
import com.onedal.app.models.CALL_PAYMENT_TYPES
import com.onedal.app.models.CallPromise
import com.onedal.app.models.CallRouteListRegion
import com.onedal.app.models.MoneyLine
import com.onedal.app.models.SimplifiedOfficeOrder

/**
 * 🎯 **플러그인이 기본 콜을 채울 때 같이 쓰는 조각** — 표 읽기 · 목록 동 · 상세 주소 · 상차 약속 · 요금 줄 · 결제 값.
 * 다른 것은 인자(`pages` · 요금 종류)뿐이다. 무엇을 어느 칸에 담을지는 배차망 플러그인이 정한다.
 * @param listOrder 이 상세의 목록 콜 — 상세로 덮이지 않는다. 손으로 연 콜은 없을 수 있다
 * @param detailText 상세 글 — 팝업 · 사진 판독 줄까지 모은 글
 */
class BaseCallFill(private val pages: PageSpecs, private val order: SimplifiedOfficeOrder, private val listOrder: SimplifiedOfficeOrder?, detailText: String?) {
    private val texts = detailText?.takeIf { it.isNotBlank() }?.let { listOf(it) }

    /** 상세 칸 하나 — 서버와 같은 정의 표 · 다른 화면의 줄은 `page` 로 (확정 뒤 화면의 받을 현금 줄 등) */
    fun read(field: PageField, part: String = "", page: Page = Page.NEW_CALL): String? = texts?.let { PageFieldRead.fieldOf(pages, page, field, it, part) }

    /** 상세 글의 요금 */
    val detailFare: Int? get() = texts?.let { PageFieldRead.fareOf(pages, Page.NEW_CALL, it) }

    /** 전체 주소만 상세 주소다 — 짧은 글자는 `listRegion` 으로 간다 */
    fun address(text: String): String? = text.takeIf { AddressForm.isFull(it) }

    /** 목록 콜의 동 — 목록 콜이 없으면 전체 주소가 못 된 짧은 글자 */
    val listRegion: CallRouteListRegion?
        get() = listOrder?.let { CallRouteListRegion(pickup = it.pickup, dropoff = it.dropoff) }
            ?: CallRouteListRegion(pickup = shortOf(order.pickup), dropoff = shortOf(order.dropoff)).takeIf { it.pickup != null || it.dropoff != null }

    private fun shortOf(text: String) = text.takeIf { it.isNotBlank() && address(it) == null }

    /** 상차 약속 — 지금 옛 값 글자 그대로 */
    fun pickupPromise(by: String? = null) = CallPromise(text = order.scheduleText, reserved = order.reserved, day = order.reservedDay?.toDouble(), at = order.reservedAt, by = by)

    /** 요금 줄 — 0 이면 안 만든다 */
    fun fareLine(kind: String): MoneyLine? = order.fare.takeIf { it > 0 }?.let { MoneyLine(kind = kind, won = it.toDouble()) }

    /** 값 목록에 있는 글자만 결제 칸에 — 자유 글은 기록에 남는다 */
    fun payment(word: String?): String? = word?.takeIf { it in CALL_PAYMENT_TYPES }

    /** 값 목록에 있는 글자만 계산서 칸에 */
    fun billing(word: String?): String? = word?.takeIf { it in CALL_BILLING_TYPES }
}
