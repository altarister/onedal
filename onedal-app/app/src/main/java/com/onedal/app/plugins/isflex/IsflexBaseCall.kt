package com.onedal.app.plugins.isflex

import com.onedal.app.core.BaseCallFill
import com.onedal.app.core.PageField
import com.onedal.app.models.BaseCall
import com.onedal.app.models.CallJob
import com.onedal.app.models.CallLoad
import com.onedal.app.models.CallMoney
import com.onedal.app.models.CallPromise
import com.onedal.app.models.CallRoute
import com.onedal.app.models.CallStop
import com.onedal.app.models.CallTime
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
        val fill = BaseCallFill(IsflexPages.pages, order, listOrder, detailText)
        return BaseCall(
            id = order.id,
            targetApp = "isflex",
            fromOtherOffice = (listOrder?.rawText ?: fill.read(PageField.PICKUP))?.contains("@")?.takeIf { it },
            route = CallRoute(
                listRegion = fill.listRegion,
                pickup = CallStop(addressDetail = fill.address(order.pickup)),
                dropoff = CallStop(addressDetail = fill.address(order.dropoff)),
                pickupDistance = order.pickupDistance,
                deliveryDistance = order.deliveryDistance,
            ),
            money = CallMoney(
                lines = listOfNotNull(fill.fareLine("income")),
                paymentType = fill.payment(fill.read(PageField.PAYMENT)),
            ),
            load = CallLoad(vehicleType = order.vehicleType),
            time = CallTime(
                pickup = fill.pickupPromise(),
                dropoff = fill.read(PageField.DROPOFF)?.let { IsflexAddress.clean(it).prefix }?.let { CallPromise(text = it) },
            ),
            job = CallJob(tripType = fill.read(PageField.TAGS), tagsText = order.tagsText, detailMemo = fill.read(PageField.MEMO, "body")),
        )
    }
}
