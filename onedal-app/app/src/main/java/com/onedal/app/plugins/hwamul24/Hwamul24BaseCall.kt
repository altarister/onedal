package com.onedal.app.plugins.hwamul24

import com.onedal.app.core.Page
import com.onedal.app.core.PageField
import com.onedal.app.core.PageFieldRead
import com.onedal.app.core.engine.AddressForm
import com.onedal.app.models.BaseCall
import com.onedal.app.models.CALL_BILLING_TYPES
import com.onedal.app.models.CALL_PAYMENT_TYPES
import com.onedal.app.models.CallJob
import com.onedal.app.models.CallLoad
import com.onedal.app.models.CallMoney
import com.onedal.app.models.CallPromise
import com.onedal.app.models.CallRoute
import com.onedal.app.models.CallRouteListRegion
import com.onedal.app.models.CallStop
import com.onedal.app.models.CallTime
import com.onedal.app.models.MoneyLine
import com.onedal.app.models.SimplifiedOfficeOrder

/**
 * 🎯 **화물24시 화면 값을 기본 콜 칸에 담는다** (계획서 C5) — 칸 기준은 shared `call-fields.table`.
 * 찾은 칸만 담는다. 합치기는 서버가 한다. 상세 칸은 서버와 같은 정의 표로 읽는다.
 * 결제방법 글자는 뜻대로 나눈다 — «선/착불» · «카드»는 결제, «인수증»은 계산서.
 * 🔴 뜻이 섞인 옛 값(`tagsText` · `postTime` · 날 표시 예약)은 지금 글자 그대로 담는다. 읽는 코드를 옮길 때 나눈다.
 * 🔴 «지» · «수» 배지와 뜻 모르는 금액은 안 담는다. 글자는 목록 줄 기록에 남는다.
 */
object Hwamul24BaseCall {
    /**
     * @param listOrder 이 상세의 목록 콜 — 상세로 덮이지 않는다. 손으로 연 콜은 없을 수 있다
     * @param detailText 상세 글
     */
    fun of(order: SimplifiedOfficeOrder, listOrder: SimplifiedOfficeOrder?, detailText: String?): BaseCall {
        val texts = detailText?.takeIf { it.isNotBlank() }?.let { listOf(it) }
        fun read(field: PageField) = texts?.let { PageFieldRead.fieldOf(Hwamul24Pages.pages, Page.NEW_CALL, field, it) }
        val detailOnly = listOrder == null
        val paying = read(PageField.PAYMENT)
        return BaseCall(
            id = order.id,
            targetApp = "hwamul24",
            route = CallRoute(
                listRegion = listOrder?.let { CallRouteListRegion(pickup = it.pickup, dropoff = it.dropoff) },
                pickup = CallStop(addressDetail = order.pickup.takeIf { detailOnly || AddressForm.isFull(it) }),
                dropoff = CallStop(addressDetail = order.dropoff.takeIf { detailOnly || AddressForm.isFull(it) }),
                pickupDistance = order.pickupDistance,
                deliveryDistance = order.deliveryDistance,
            ),
            money = CallMoney(
                lines = listOfNotNull(
                    order.fare.takeIf { it > 0 }?.let { MoneyLine(kind = "total", won = it.toDouble()) },
                    PageFieldRead.fareOf(Hwamul24Pages.pages, Page.NEW_CALL, texts.orEmpty())?.let { MoneyLine(kind = "freight", won = it.toDouble()) },
                ),
                paymentType = paying?.takeIf { it in CALL_PAYMENT_TYPES },
                billingType = paying?.takeIf { it in CALL_BILLING_TYPES },
            ),
            load = CallLoad(vehicleType = order.vehicleType),
            time = CallTime(
                pickup = CallPromise(text = order.scheduleText, reserved = order.reserved, day = order.reservedDay?.toDouble(), at = order.reservedAt),
                dropoff = order.tagsText?.split(" ")?.firstOrNull { it.endsWith("착") }?.let { CallPromise(text = it) },
                postTime = order.postTime,
            ),
            job = CallJob(tagsText = order.tagsText, detailMemo = read(PageField.MEMO)),
        )
    }
}
