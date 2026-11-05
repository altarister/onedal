package com.onedal.app.plugins.isflex

import com.onedal.app.core.Page
import com.onedal.app.core.PageField
import com.onedal.app.core.PageFieldRead
import com.onedal.app.core.engine.AddressForm
import com.onedal.app.models.BaseCall
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
 * 🎯 **플렉스 화면 값을 기본 콜 칸에 담는다** (계획서 C3) — 칸 기준은 shared `call-fields.table`.
 * 찾은 칸만 담는다. 합치기는 서버가 한다. 상세 칸은 서버와 같은 정의 표로 읽는다.
 * 🔴 뜻이 섞인 옛 값(`tagsText` · 「과적」이 들어오는 `tripType`)은 지금 글자 그대로 담는다. 읽는 코드를 옮길 때 나눈다.
 * 🔴 페이지 표에 읽는 법이 없는 값(물품 글 · 약속 시각 · 안내 영상 칸)은 뒤로 둔다.
 */
object IsflexBaseCall {
    /**
     * @param listOrder 이 상세의 목록 콜 — 상세로 덮이지 않는다. 손으로 연 콜은 없을 수 있다
     * @param detailText 상세 글
     */
    fun of(order: SimplifiedOfficeOrder, listOrder: SimplifiedOfficeOrder?, detailText: String?): BaseCall {
        val texts = detailText?.takeIf { it.isNotBlank() }?.let { listOf(it) }
        fun read(field: PageField, part: String = "") = texts?.let { PageFieldRead.fieldOf(IsflexPages.pages, Page.NEW_CALL, field, it, part) }
        val detailOnly = listOrder == null
        return BaseCall(
            id = order.id,
            targetApp = "isflex",
            fromOtherOffice = listOrder?.rawText?.contains("@")?.takeIf { it },
            route = CallRoute(
                listRegion = listOrder?.let { CallRouteListRegion(pickup = it.pickup, dropoff = it.dropoff) },
                pickup = CallStop(addressDetail = order.pickup.takeIf { detailOnly || AddressForm.isFull(it) }),
                dropoff = CallStop(addressDetail = order.dropoff.takeIf { detailOnly || AddressForm.isFull(it) }),
                pickupDistance = order.pickupDistance,
                deliveryDistance = order.deliveryDistance,
            ),
            money = CallMoney(
                lines = if (order.fare > 0) listOf(MoneyLine(kind = "income", won = order.fare.toDouble())) else emptyList(),
                paymentType = read(PageField.PAYMENT),
            ),
            load = CallLoad(vehicleType = order.vehicleType),
            time = CallTime(
                pickup = CallPromise(text = order.scheduleText, reserved = order.reserved, day = order.reservedDay?.toDouble(), at = order.reservedAt),
                dropoff = read(PageField.DROPOFF)?.let { IsflexAddress.clean(it).prefix }?.let { CallPromise(text = it) },
            ),
            job = CallJob(tripType = read(PageField.TAGS), tagsText = order.tagsText, detailMemo = read(PageField.MEMO, "body")),
        )
    }
}
