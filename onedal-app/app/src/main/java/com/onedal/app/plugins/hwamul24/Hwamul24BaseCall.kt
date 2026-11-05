package com.onedal.app.plugins.hwamul24

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
        val fill = BaseCallFill(Hwamul24Pages.pages, order, listOrder, detailText)
        val paying = fill.read(PageField.PAYMENT)
        return BaseCall(
            id = order.id,
            targetApp = "hwamul24",
            route = CallRoute(
                listRegion = fill.listRegion,
                pickup = CallStop(addressDetail = fill.address(order.pickup)),
                dropoff = CallStop(addressDetail = fill.address(order.dropoff)),
                pickupDistance = order.pickupDistance,
                deliveryDistance = order.deliveryDistance,
            ),
            money = CallMoney(
                lines = listOfNotNull(
                    fill.fareLine("total"),
                    fill.detailFare?.let { MoneyLine(kind = "freight", won = it.toDouble()) },
                ),
                paymentType = fill.payment(paying),
                billingType = fill.billing(paying),
            ),
            load = CallLoad(vehicleType = order.vehicleType),
            time = CallTime(
                pickup = fill.pickupPromise(),
                dropoff = order.tagsText?.split(" ")?.firstOrNull { it in Hwamul24Parser.DROPOFF_DAY_BADGES }?.let { CallPromise(text = it) },
                postTime = order.postTime,
            ),
            job = CallJob(tagsText = order.tagsText, detailMemo = fill.read(PageField.MEMO)),
        )
    }
}
