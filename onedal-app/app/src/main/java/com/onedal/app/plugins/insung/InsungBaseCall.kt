package com.onedal.app.plugins.insung

import com.onedal.app.core.BaseCallFill
import com.onedal.app.core.PageField
import com.onedal.app.models.BaseCall
import com.onedal.app.models.CallJob
import com.onedal.app.models.CallLoad
import com.onedal.app.models.CallMoney
import com.onedal.app.models.CallRoute
import com.onedal.app.models.CallStop
import com.onedal.app.models.CallTime
import com.onedal.app.models.MoneyLine
import com.onedal.app.models.SimplifiedOfficeOrder

/**
 * 🎯 **인성 화면 값을 기본 콜 칸에 담는다** (계획서 C4) — 칸 기준은 shared `call-fields.table`.
 * 찾은 칸만 담는다. 합치기는 서버가 한다. 상세 칸은 서버와 같은 정의 표로 팝업 세 장을 모은 글에서 읽는다.
 * 🔴 뜻이 섞인 옛 값(`scheduleText` · `postTime` · `tagsText`)은 지금 글자 그대로 담는다. 읽는 코드를 옮길 때 나눈다.
 * 🔴 목록 앞글자(왕복 · 경유 · 하차 약속 · 동승)는 풀지 않는다. 글자는 목록 줄 기록에 남는다.
 */
object InsungBaseCall {
    /**
     * @param listOrder 이 상세의 목록 콜 — 상세로 덮이지 않는다. 손으로 연 콜은 없을 수 있다
     * @param detailText 팝업 세 장까지 모은 상세 글
     */
    fun of(order: SimplifiedOfficeOrder, listOrder: SimplifiedOfficeOrder?, detailText: String?): BaseCall {
        val fill = BaseCallFill(InsungPages.pages, order, listOrder, detailText)
        fun stop(side: String, address: String) = CallStop(
            addressDetail = fill.address(address),
            customerName = fill.read(PageField.CONTACT, "$side.customer"),
            department = fill.read(PageField.CONTACT, "$side.department"),
            contactName = fill.read(PageField.CONTACT, "$side.contactName"),
            phone1 = fill.read(PageField.CONTACT, "$side.phone1"),
            phone2 = fill.read(PageField.CONTACT, "$side.phone2"),
        )
        return BaseCall(
            id = order.id,
            targetApp = "insung",
            dispatcherName = fill.read(PageField.CONTACT, "dispatcher"),
            dispatcherPhone = fill.read(PageField.CONTACT, "dispatcherPhone"),
            fromOtherOffice = listOrder?.rawText?.contains("@")?.takeIf { it },
            stage = fill.read(PageField.STAGE),
            route = CallRoute(
                listRegion = fill.listRegion,
                pickup = stop("pickup", order.pickup),
                dropoff = stop("dropoff", order.dropoff),
                pickupDistance = order.pickupDistance,
                deliveryDistance = order.deliveryDistance,
            ),
            money = CallMoney(
                lines = listOfNotNull(
                    fill.fareLine("income"),
                    fill.detailFare?.takeIf { it != order.fare }?.let { MoneyLine(kind = "unknown", won = it.toDouble(), label = "상세 요금") },   // 목록 요금과 다른 상세 금액 — 판정은 안 읽는다
                    fill.read(PageField.COMMISSION)?.let { MoneyLine(kind = "fee", rate = it) },
                    fill.read(PageField.TOLL)?.let { MoneyLine(kind = "consign", rate = it) },
                ),
                paymentType = fill.payment(fill.read(PageField.PAYMENT)),
                billingType = fill.billing(fill.read(PageField.BILLING)),
            ),
            load = CallLoad(vehicleType = order.vehicleType ?: fill.read(PageField.VEHICLE_TYPE), itemSize = order.itemSize, itemDescription = fill.read(PageField.ITEM_SIZE)),
            time = CallTime(
                pickup = fill.pickupPromise(),
                postTime = order.postTime,
            ),
            job = CallJob(
                tripType = fill.read(PageField.TAGS),
                orderForm = fill.read(PageField.RESERVATION),
                tagsText = order.tagsText,
                detailMemo = fill.read(PageField.MEMO, "popup")?.replace(Regex("""\s+"""), " ")?.trim()?.takeIf { it.isNotEmpty() } ?: fill.read(PageField.MEMO, "body"),
            ),
        )
    }
}
